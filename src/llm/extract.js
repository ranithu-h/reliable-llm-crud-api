import fs from "node:fs/promises";
import OpenAI from "openai";

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
        text: "John Smith is a Software Engineer with 4 years of experience. Skilled in JavaScript, Node.js and PostgreSQL. Bachelor of Computer Science.",
      }),
    },
  ],
});

console.log(response.choices[0].message.content);