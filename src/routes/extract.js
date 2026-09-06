import { z } from "zod";
import express from "express";

const router = express.Router();

const extractInputSchema = z.object({
  text: z.string().min(1).max(5000),
});

const extractOutputSchema = z.object({
  name: z.string().nullable(),
  most_recent_title: z.string().nullable(),
  years_experience: z.number().nullable(),
  top_skills: z.array(z.string()).max(5),
  education_level: z.enum([
    "high_school",
    "bachelors",
    "masters",
    "phd",
    "other",
    "unknown",
  ]),
  confidence: z.number().min(0).max(1),
  needs_review: z.boolean(),
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

function validateExtractInput(body) {
  return extractInputSchema.safeParse(body);
}

router.post("/extract", (req, res) => {
  const result = validateExtractInput(req.body);

  if (!result.success) {
    return res.status(400).json({
      error: "Invalid input",
    });
  }

  if (process.env.LLM_STUB === "1") {
    const output = extractOutputSchema.safeParse(stubResponse);

    if (!output.success) {
      return res.status(500).json({
        error: "Invalid stub response",
      });
    }

    return res.json(output.data);
  }

  return res.json({
    message: "Input is valid",
    text: result.data.text,
  });
});

export default router;