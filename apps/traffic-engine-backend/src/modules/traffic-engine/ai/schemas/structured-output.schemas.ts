import { z } from 'zod';

/** Schema for outline generation (generate step, mode: outline) */
export const OutlineSchema = z.object({
  title: z.string().min(1).optional(),
  h2s: z.array(z.string()).min(1).max(20),
  faq: z
    .array(
      z.object({
        q: z.string(),
        a: z.string(),
      }),
    )
    .optional(),
});

export type Outline = z.infer<typeof OutlineSchema>;

/** Schema for analysis step */
export const AnalysisSchema = z.object({
  seoScore: z.number().min(0).max(100),
  readabilityScore: z.number().min(0).max(100).optional(),
  wordCount: z.number().int().min(0).optional(),
  issues: z.array(z.string()).optional(),
  missingKeywords: z.array(z.string()).optional(),
  keywordCoverageScore: z.number().min(0).max(1).optional(),
  experienceScore: z.number().min(0).max(100).optional(),
  genericContentScore: z.number().min(0).max(100).optional(),
  informationGainScore: z.number().min(0).max(100).optional(),
  eeatSignalScore: z.number().min(0).max(100).optional(),
});

export type Analysis = z.infer<typeof AnalysisSchema>;

/** Schema for seo_check step */
export const SeoCheckSchema = z.object({
  passed: z.boolean(),
  score: z.number().min(0).max(100),
  issues: z.array(z.string()).optional(),
  googleChecklist: z.record(z.string(), z.unknown()).optional(),
  improvedContent: z.string().optional(),
});

export type SeoCheck = z.infer<typeof SeoCheckSchema>;

/** Try to parse raw text against a Zod schema; on failure attempt to strip code fences and retry. */
export function safeParse<T>(schema: z.ZodSchema<T>, raw: string): T | null {
  const attempts = [raw, raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')];
  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt) as unknown;
      const result = schema.safeParse(parsed);
      if (result.success) return result.data;
    } catch {
      // continue
    }
  }
  return null;
}
