import { describe, expect, it } from "vitest";
import { averageScore, GradingScaleSchema, overallLetterGrade } from "@/lib/grades/grading-scale";

const scale = { aMin: 80, bMin: 65, cMin: 50 };
describe("school-defined cumulative grading", () => {
  it("averages saved scores, includes zero, rounds once, and handles an empty term", () => {
    expect(averageScore([])).toBeNull();
    expect(averageScore([{ percentage: 70 }, { percentage: 65 }])).toBe(67.5);
    expect(averageScore([{ percentage: 0 }, { percentage: 100 }, { percentage: 100 }])).toBe(66.67);
  });
  it.each([
    [100, "A"],
    [80, "A"],
    [79.99, "B"],
    [65, "B"],
    [64.99, "C"],
    [50, "C"],
    [49.99, "D"],
    [0, "D"],
  ])("maps %s to %s with no boundary gaps", (score, letter) => {
    expect(overallLetterGrade(Number(score), scale)).toBe(letter);
  });
  it("does not invent a grade before a scale or results exist", () => {
    expect(overallLetterGrade(90, null)).toBeNull();
    expect(overallLetterGrade(null, scale)).toBeNull();
  });
  it.each([
    { aMin: 50, bMin: 65, cMin: 40 },
    { aMin: 65, bMin: 65, cMin: 40 },
    { aMin: 80, bMin: 65, cMin: 0 },
    { aMin: 101, bMin: 65, cMin: 40 },
    { aMin: 80.125, bMin: 65, cMin: 40 },
  ])("rejects an incomplete or overlapping scale: %j", (input) => {
    expect(GradingScaleSchema.safeParse(input).success).toBe(false);
  });
});
