import fs from "node:fs/promises";
import OpenAI from "openai";
import { extractOutputSchema } from "../schemas/extract.js";

export async function extractCV(text) {

    const prompt = await fs.readFile(
    new URL("../../prompts/extract-v1.md", import.meta.url),
    "utf8"
    );

    const client = new OpenAI({
    apiKey: process.env.LLM_API_KEY,
    baseURL: process.env.LLM_BASE_URL,
    });

    const response = await client.chat.completions.create({
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
    });

    const rawOutput = response.choices[0].message.content;

    let parsedOutput;
    let validationError;

    try {
    parsedOutput = JSON.parse(rawOutput);
    } catch (error) {
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

    if (parsedOutput === undefined || validationError) {
    console.log("Repair needed");

    const repairResponse = await client.chat.completions.create({
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
    });

    const repairedRawOutput = repairResponse.choices[0].message.content;

    try {
        const repairedOutput = JSON.parse(repairedRawOutput);

        const validation = extractOutputSchema.safeParse(repairedOutput);

        if (!validation.success) {
        console.log("Repair failed validation:", validation.error);

        await fs.appendFile(
            "logs/quarantine.jsonl",
            JSON.stringify({
            timestamp: new Date().toISOString(),
            raw_output: rawOutput,
            repaired_output: repairedRawOutput,
            error: validation.error.message,
            }) + "\n"
        );

        console.log("Output quarantined");
        throw new Error("LLM output failed validation after repair");
        } else {
        return validation.data;
        }
    } catch (error) {
        console.log("Repair produced invalid JSON");

        await fs.appendFile(
        "logs/quarantine.jsonl",
        JSON.stringify({
            timestamp: new Date().toISOString(),
            raw_output: rawOutput,
            repaired_output: repairedRawOutput,
            error: "Repair produced invalid JSON",
        }) + "\n"
        );

        console.log("Output quarantined");
        throw new Error("LLM repair produced invalid JSON");
    }
    }
}