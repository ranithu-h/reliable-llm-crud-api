import express from "express";
import { z } from "zod";
import { extractOutputSchema } from "../schemas/extract.js";
import { extractCV } from "../llm/extract.js";

const router = express.Router();

const extractInputSchema = z.object({
  text: z.string().min(1).max(5000),
});

const stubResponse = {
  name: "John Smith",
  most_recent_title: "Software Engineer",
  years_experience: 4,
  top_skills: ["JavaScript", "Node.js", "PostgreSQL"],
  education_level: "bachelors",
  confidence: 0.95,
  needs_review: false,
};

router.post("/extract", async (req, res) => {
  const result = extractInputSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      error: "Invalid input",
    });
  }

  if (process.env.LLM_STUB === "1") {
    return res.json(stubResponse);
  }

  if (process.env.LLM_ENABLED === "false") {
    return res.status(503).json({
      error: "LLM service is currently disabled",
    });
  }

  try {
    const output = await extractCV(result.data.text);

    return res.json(output);
  } catch (error) {
    console.error("Extraction failed:", error);

    if (error.message === "Request timed out.") {
      return res.status(504).json({
        error: "LLM request timed out",
      });
    }

    if (
      error.message === "LLM output failed validation after repair" ||
      error.message === "LLM repair produced invalid JSON"
    ) {
      return res.status(422).json({
        error: "LLM could not produce valid structured output",
      });
    }

    return res.status(500).json({
      error: "Extraction failed",
    });
  }
});

export default router;