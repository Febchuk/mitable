import { describe, expect, it } from "vitest";
import {
  EMPTY_ANSWER,
  isAnswered,
  normalizeAnswer,
  QuestionInputSchema,
  suggestPoints,
  totalPoints,
} from "./model";

const question = {
  kind: "multiple_choice" as const,
  prompt: "Pick one",
  options: ["A", "B"],
  points: 2,
  correctOption: null,
  correctNumber: null,
};

describe("QuestionInputSchema", () => {
  it("accepts each kind of question", () => {
    expect(QuestionInputSchema.safeParse(question).success).toBe(true);
    for (const kind of ["short_answer", "long_answer", "number"] as const)
      expect(QuestionInputSchema.safeParse({ ...question, kind, options: null }).success).toBe(
        true
      );
  });

  it("rejects multiple choice with fewer than two options", () => {
    expect(QuestionInputSchema.safeParse({ ...question, options: ["A"] }).success).toBe(false);
    expect(QuestionInputSchema.safeParse({ ...question, options: null }).success).toBe(false);
  });

  it("rejects a correct option that isn't one of the options", () => {
    expect(QuestionInputSchema.safeParse({ ...question, correctOption: 2 }).success).toBe(false);
    expect(QuestionInputSchema.safeParse({ ...question, correctOption: 1 }).success).toBe(true);
  });

  it("rejects keys that don't fit the kind of question", () => {
    const short = { ...question, kind: "short_answer" as const, options: null };
    expect(QuestionInputSchema.safeParse({ ...short, correctNumber: 4 }).success).toBe(false);
    expect(QuestionInputSchema.safeParse({ ...short, correctOption: 0 }).success).toBe(false);
  });

  it("rejects blank prompts and points of zero", () => {
    expect(QuestionInputSchema.safeParse({ ...question, prompt: "   " }).success).toBe(false);
    expect(QuestionInputSchema.safeParse({ ...question, points: 0 }).success).toBe(false);
  });
});

describe("normalizeAnswer", () => {
  it("keeps only the field the question uses", () => {
    const input = { selectedOption: 1, answerText: "words", answerNumber: 3 };
    expect(normalizeAnswer({ kind: "multiple_choice", options: ["A", "B"] }, input)).toEqual({
      ...EMPTY_ANSWER,
      selectedOption: 1,
    });
    expect(normalizeAnswer({ kind: "short_answer", options: null }, input)).toEqual({
      ...EMPTY_ANSWER,
      answerText: "words",
    });
    expect(normalizeAnswer({ kind: "number", options: null }, input)).toEqual({
      ...EMPTY_ANSWER,
      answerNumber: 3,
    });
  });

  it("refuses an option that doesn't exist", () => {
    expect(
      normalizeAnswer(
        { kind: "multiple_choice", options: ["A", "B"] },
        {
          ...EMPTY_ANSWER,
          selectedOption: 2,
        }
      )
    ).toBeNull();
  });
});

describe("suggestPoints", () => {
  const key = { correctOption: 1, correctNumber: null };

  it("marks multiple choice against the key", () => {
    const multiple = { kind: "multiple_choice" as const, points: 2 };
    expect(suggestPoints(multiple, key, { ...EMPTY_ANSWER, selectedOption: 1 })).toBe(2);
    expect(suggestPoints(multiple, key, { ...EMPTY_ANSWER, selectedOption: 0 })).toBe(0);
    expect(suggestPoints(multiple, key, null)).toBe(0);
  });

  it("marks numbers against the key, including a key of zero", () => {
    const number = { kind: "number" as const, points: 3 };
    const zero = { correctOption: null, correctNumber: 0 };
    expect(suggestPoints(number, zero, { ...EMPTY_ANSWER, answerNumber: 0 })).toBe(3);
    expect(suggestPoints(number, zero, { ...EMPTY_ANSWER, answerNumber: 1 })).toBe(0);
    expect(suggestPoints(number, zero, null)).toBe(0);
  });

  it("leaves written answers and missing keys to the teacher", () => {
    expect(suggestPoints({ kind: "short_answer", points: 1 }, null, null)).toBeNull();
    expect(suggestPoints({ kind: "long_answer", points: 1 }, key, null)).toBeNull();
    expect(suggestPoints({ kind: "multiple_choice", points: 1 }, null, null)).toBeNull();
  });
});

it("adds up points", () => {
  expect(totalPoints([{ points: 2 }, { points: 1.5 }])).toBe(3.5);
  expect(totalPoints([])).toBe(0);
});

it("knows whether a question has been answered", () => {
  expect(isAnswered(null)).toBe(false);
  expect(isAnswered(EMPTY_ANSWER)).toBe(false);
  expect(isAnswered({ ...EMPTY_ANSWER, answerText: "   " })).toBe(false);
  expect(isAnswered({ ...EMPTY_ANSWER, answerText: "x" })).toBe(true);
  expect(isAnswered({ ...EMPTY_ANSWER, selectedOption: 0 })).toBe(true);
  expect(isAnswered({ ...EMPTY_ANSWER, answerNumber: 0 })).toBe(true);
});
