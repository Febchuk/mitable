import { z } from "zod";

export const GradingScaleSchema = z
  .object({
    aMin: z.number().finite().min(0).max(100).multipleOf(0.01),
    bMin: z.number().finite().min(0).max(100).multipleOf(0.01),
    cMin: z.number().finite().min(0).max(100).multipleOf(0.01),
  })
  .refine((scale) => scale.aMin > scale.bMin && scale.bMin > scale.cMin && scale.cMin > 0, {
    message: "A must start above B, B above C, and C above 0. D covers scores below C.",
  });

export type GradingScale = z.infer<typeof GradingScaleSchema>;

export function averageScore(rows: Array<{ percentage: number }>): number | null {
  if (!rows.length) return null;
  return Math.round((rows.reduce((sum, row) => sum + row.percentage, 0) / rows.length) * 100) / 100;
}

export function overallLetterGrade(
  average: number | null,
  scale: GradingScale | null
): string | null {
  if (average == null || !Number.isFinite(average) || average < 0 || average > 100 || !scale)
    return null;
  if (average >= scale.aMin) return "A";
  if (average >= scale.bMin) return "B";
  if (average >= scale.cMin) return "C";
  return "D";
}
