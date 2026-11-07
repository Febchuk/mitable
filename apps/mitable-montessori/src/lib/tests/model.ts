import { z } from "zod";

export const QUESTION_KINDS = ["multiple_choice", "short_answer", "long_answer", "number"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export const QUESTION_KIND_LABELS: Record<QuestionKind, string> = {
  multiple_choice: "Multiple choice",
  short_answer: "Short answer",
  long_answer: "Long answer",
  number: "Number",
};

export type TestStatus = "draft" | "published" | "closed";

export type TestQuestion = {
  id: string;
  kind: QuestionKind;
  prompt: string;
  options: string[] | null;
  points: number;
};

export type AnswerKey = {
  correctOption: number | null;
  correctNumber: number | null;
};

export type TestAnswer = {
  selectedOption: number | null;
  answerText: string | null;
  answerNumber: number | null;
};

export const EMPTY_ANSWER: TestAnswer = {
  selectedOption: null,
  answerText: null,
  answerNumber: null,
};

export const QuestionInputSchema = z
  .object({
    kind: z.enum(QUESTION_KINDS),
    prompt: z.string().trim().min(1, "Every question needs some text").max(4000),
    options: z
      .array(z.string().trim().min(1, "Options can't be blank").max(500))
      .max(20)
      .nullable(),
    points: z.number().finite().positive("Points must be above zero").max(1000),
    correctOption: z.number().int().min(0).nullable(),
    correctNumber: z.number().finite().nullable(),
  })
  .superRefine((question, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (question.kind === "multiple_choice") {
      const count = question.options?.length ?? 0;
      if (count < 2) issue("Multiple choice questions need at least two options");
      if (question.correctOption !== null && question.correctOption >= count)
        issue("The correct option must be one of the options");
    } else {
      if (question.options !== null) issue("Only multiple choice questions have options");
      if (question.correctOption !== null) issue("Only multiple choice questions have an option");
    }
    if (question.kind !== "number" && question.correctNumber !== null)
      issue("Only number questions have a correct number");
  });

export type QuestionInput = z.infer<typeof QuestionInputSchema>;

export const QuestionsInputSchema = z.object({
  questions: z.array(QuestionInputSchema).max(200),
});

export const AnswerInputSchema = z.object({
  questionId: z.string().uuid(),
  selectedOption: z.number().int().min(0).nullable(),
  answerText: z.string().max(20000).nullable(),
  answerNumber: z.number().finite().nullable(),
});

/** Keeps only the field this kind of question uses, or null if the value can't apply to it. */
export function normalizeAnswer(
  question: Pick<TestQuestion, "kind" | "options">,
  input: TestAnswer
): TestAnswer | null {
  switch (question.kind) {
    case "multiple_choice":
      if (input.selectedOption !== null && input.selectedOption >= (question.options?.length ?? 0))
        return null;
      return { ...EMPTY_ANSWER, selectedOption: input.selectedOption };
    case "number":
      return { ...EMPTY_ANSWER, answerNumber: input.answerNumber };
    case "short_answer":
    case "long_answer":
      return { ...EMPTY_ANSWER, answerText: input.answerText };
  }
}

/** The mark a teacher starts from. Written answers, and questions with no key, need a person. */
export function suggestPoints(
  question: Pick<TestQuestion, "kind" | "points">,
  key: AnswerKey | null,
  answer: TestAnswer | null
): number | null {
  if (question.kind === "multiple_choice" && key?.correctOption != null)
    return answer?.selectedOption === key.correctOption ? question.points : 0;
  if (question.kind === "number" && key?.correctNumber != null)
    return answer?.answerNumber === key.correctNumber ? question.points : 0;
  return null;
}

export function totalPoints(questions: Pick<TestQuestion, "points">[]): number {
  return questions.reduce((total, question) => total + question.points, 0);
}

export function isAnswered(answer: TestAnswer | null | undefined): boolean {
  if (!answer) return false;
  return (
    answer.selectedOption !== null ||
    answer.answerNumber !== null ||
    (answer.answerText ?? "").trim().length > 0
  );
}
