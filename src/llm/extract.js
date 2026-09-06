import fs from "node:fs/promises";
import OpenAI from "openai";
import { extractOutputSchema } from "../schemas/extract.js";
import { retryWithBackoff } from "./retry.js";

export async function extractCV(text) {
  const prompt = await fs.readFile(
    new URL("../../prompts/extract-v1.md", import.meta.url),
    "utf8"
  );

  const client = new OpenAI({
    apiKey: process.env.LLM_API_KEY,
    baseURL: process.env.LLM_BASE_URL,
    timeout: 30000,
    maxRetries: 0,
  });

  const startTime = Date.now();

  const response = await retryWithBackoff(() =>
    client.chat.completions.create({
      model: process.env.LLM_MODEL,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: prompt,
        },
        {
          role: "user",
          content: JSON.stringify({
            text,
          }),
        },
      ],
    })
  );

  const duration = Date.now() - startTime;

  const inputTokens = response.usage?.prompt_tokens ?? 0;
  const outputTokens = response.usage?.completion_tokens ?? 0;

  console.log({
    prompt_version: "extract-v1",
    model: process.env.LLM_MODEL,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    duration_ms: duration,
    repair: false,
  });

  const rawOutput = response.choices[0].message.content;

  let parsedOutput;
  let validationError;

  try {
    parsedOutput = JSON.parse(rawOutput);
  } catch {
    console.log("Invalid JSON from LLM");
  }

  if (parsedOutput !== undefined) {
    const validation = extractOutputSchema.safeParse(parsedOutput);

    if (!validation.success) {
      validationError = validation.error;
    } else {
      return validation.data;
    }
  }

  console.log("Repair needed");

  const repairStartTime = Date.now();

  const repairResponse = await retryWithBackoff(() =>
    client.chat.completions.create({
      model: process.env.LLM_MODEL,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
Return only a valid JSON object matching this exact schema:

{
  "name": "string or null",
  "most_recent_title": "string or null",
  "years_experience": "number or null",
  "top_skills": ["string"],
  "education_level": "high_school | bachelors | masters | phd | other | unknown",
  "confidence": "number between 0 and 1",
  "needs_review": "boolean"
}

Do not add explanations or markdown.
Do not invent information.
          `,
        },
        {
          role: "user",
          content: JSON.stringify({
            broken_output: rawOutput,
            error: validationError
              ? validationError.message
              : "The output was not valid JSON.",
          }),
        },
      ],
    })
  );

  const repairDuration = Date.now() - repairStartTime;

  const repairedRawOutput =
    repairResponse.choices[0].message.content;

  let repairedOutput;

  try {
    repairedOutput = JSON.parse(repairedRawOutput);
  } catch {
    await fs.appendFile(
      "logs/quarantine.jsonl",
      JSON.stringify({
        timestamp: new Date().toISOString(),
        raw_output: rawOutput,
        repaired_output: repairedRawOutput,
        error: "Repair produced invalid JSON",
      }) + "\n"
    );

    throw new Error("LLM repair produced invalid JSON");
  }

  const repairedValidation =
    extractOutputSchema.safeParse(repairedOutput);

  if (!repairedValidation.success) {
    await fs.appendFile(
      "logs/quarantine.jsonl",
      JSON.stringify({
        timestamp: new Date().toISOString(),
        raw_output: rawOutput,
        repaired_output: repairedRawOutput,
        error: repairedValidation.error.message,
      }) + "\n"
    );

    throw new Error("LLM output failed validation after repair");
  }

  console.log({
    prompt_version: "extract-v1",
    model: process.env.LLM_MODEL,
    input_tokens: repairResponse.usage?.prompt_tokens ?? 0,
    output_tokens: repairResponse.usage?.completion_tokens ?? 0,
    duration_ms: repairDuration,
    repair: true,
  });

  return repairedValidation.data;
}