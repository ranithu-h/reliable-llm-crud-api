import { z } from "zod";

export const extractOutputSchema = z.object({
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