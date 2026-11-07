"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { PageHeader, cardStyle } from "@/components/montessori/page-header";
import { sendJson } from "@/components/tests/request";
import {
  errorStyle,
  inputStyle,
  labelStyle,
  mutedStyle,
  primaryButtonStyle,
  quietButtonStyle,
} from "@/components/tests/styles";
import {
  QUESTION_KIND_LABELS,
  QUESTION_KINDS,
  QuestionsInputSchema,
  totalPoints,
  type QuestionInput,
  type QuestionKind,
} from "@/lib/tests/model";
import type { StaffTest } from "@/lib/tests/queries";

type DraftQuestion = {
  localId: string;
  kind: QuestionKind;
  prompt: string;
  options: string[];
  points: string;
  correctOption: number | null;
  correctNumber: string;
};

function newQuestion(kind: QuestionKind): DraftQuestion {
  return {
    localId: crypto.randomUUID(),
    kind,
    prompt: "",
    options: kind === "multiple_choice" ? ["", ""] : [],
    points: "1",
    correctOption: null,
    correctNumber: "",
  };
}

function toInput(question: DraftQuestion): QuestionInput {
  return {
    kind: question.kind,
    prompt: question.prompt,
    options: question.kind === "multiple_choice" ? question.options : null,
    points: Number(question.points),
    correctOption: question.kind === "multiple_choice" ? question.correctOption : null,
    correctNumber:
      question.kind === "number" && question.correctNumber.trim() !== ""
        ? Number(question.correctNumber)
        : null,
  };
}

export default function TestBuilder({ test }: { test: StaffTest }) {
  const router = useRouter();
  const [title, setTitle] = React.useState(test.title);
  const [subject, setSubject] = React.useState(test.subject);
  const [instructions, setInstructions] = React.useState(test.instructions ?? "");
  const [questions, setQuestions] = React.useState<DraftQuestion[]>(() =>
    test.questions.map((question) => ({
      localId: question.id,
      kind: question.kind,
      prompt: question.prompt,
      options: question.options ?? [],
      points: String(question.points),
      correctOption: question.key?.correctOption ?? null,
      correctNumber: question.key?.correctNumber?.toString() ?? "",
    }))
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);

  const update = (localId: string, change: Partial<DraftQuestion>) =>
    setQuestions((current) =>
      current.map((question) =>
        question.localId === localId ? { ...question, ...change } : question
      )
    );

  const move = (index: number, by: number) =>
    setQuestions((current) => {
      const next = [...current];
      const [question] = next.splice(index, 1);
      next.splice(index + by, 0, question);
      return next;
    });

  const save = async (): Promise<boolean> => {
    setError(null);
    setNotice(null);
    const parsed = QuestionsInputSchema.safeParse({ questions: questions.map(toInput) });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const number = typeof issue?.path[1] === "number" ? `Question ${issue.path[1] + 1}: ` : "";
      setError(`${number}${issue?.message ?? "Check the questions"}`);
      return false;
    }
    const failure =
      (await sendJson(`/api/v1/tests/${test.id}`, "PATCH", {
        title,
        subject,
        instructions: instructions.trim() || null,
      })) ?? (await sendJson(`/api/v1/tests/${test.id}/questions`, "PUT", parsed.data));
    if (failure) {
      setError(failure);
      return false;
    }
    return true;
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    await action();
    setBusy(false);
  };

  const saveDraft = () =>
    run(async () => {
      if (await save()) setNotice("Draft saved.");
    });

  const publish = () =>
    run(async () => {
      if (!(await save())) return;
      const failure = await sendJson(`/api/v1/tests/${test.id}`, "PATCH", { status: "published" });
      if (failure) {
        setError(failure);
        return;
      }
      router.refresh();
    });

  const deleteDraft = () =>
    run(async () => {
      const failure = await sendJson(`/api/v1/tests/${test.id}`, "DELETE");
      if (failure) {
        setError(failure);
        return;
      }
      router.push("/app/tests");
      router.refresh();
    });

  const total = totalPoints(
    questions.map((question) => ({ points: Number(question.points) || 0 }))
  );

  return (
    <div>
      <PageHeader
        overline={<Link href="/app/tests">Tests</Link>}
        title={title || "Untitled test"}
        subtitle={`Draft for ${test.classroomName}. Students can't see it until you publish.`}
      />
      <div style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
        <div style={{ ...cardStyle, padding: 18, marginBottom: 14 }}>
          <label style={labelStyle}>
            Test title
            <input
              style={{ ...inputStyle, marginTop: 6 }}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label style={labelStyle}>
            Subject
            <input
              style={{ ...inputStyle, marginTop: 6 }}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </label>
          <label style={{ ...labelStyle, marginBottom: 0 }}>
            Instructions (optional)
            <textarea
              style={{ ...inputStyle, marginTop: 6, minHeight: 70 }}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
            />
          </label>
        </div>

        {questions.map((question, index) => (
          <div key={question.localId} style={{ ...cardStyle, padding: 18, marginBottom: 14 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                marginBottom: 12,
                flexWrap: "wrap",
              }}
            >
              <strong style={{ fontSize: 14 }}>
                Question {index + 1}: {QUESTION_KIND_LABELS[question.kind]}
              </strong>
              <span style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  style={quietButtonStyle}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  Up
                </button>
                <button
                  type="button"
                  style={quietButtonStyle}
                  disabled={index === questions.length - 1}
                  onClick={() => move(index, 1)}
                >
                  Down
                </button>
                <button
                  type="button"
                  style={quietButtonStyle}
                  onClick={() =>
                    setQuestions((current) =>
                      current.filter((item) => item.localId !== question.localId)
                    )
                  }
                >
                  Remove
                </button>
              </span>
            </div>
            <label style={labelStyle}>
              Question
              <textarea
                style={{ ...inputStyle, marginTop: 6, minHeight: 60 }}
                value={question.prompt}
                onChange={(event) => update(question.localId, { prompt: event.target.value })}
              />
            </label>

            {question.kind === "multiple_choice" && (
              <fieldset style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
                <legend style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Options. Select the correct one to get a suggested mark.
                </legend>
                {question.options.map((option, optionIndex) => (
                  <div
                    key={optionIndex}
                    style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}
                  >
                    <input
                      type="radio"
                      name={`correct-${question.localId}`}
                      aria-label={`Option ${optionIndex + 1} is correct`}
                      checked={question.correctOption === optionIndex}
                      onChange={() => update(question.localId, { correctOption: optionIndex })}
                    />
                    <input
                      style={inputStyle}
                      aria-label={`Option ${optionIndex + 1}`}
                      value={option}
                      onChange={(event) =>
                        update(question.localId, {
                          options: question.options.map((item, itemIndex) =>
                            itemIndex === optionIndex ? event.target.value : item
                          ),
                        })
                      }
                    />
                    <button
                      type="button"
                      style={quietButtonStyle}
                      disabled={question.options.length <= 2}
                      onClick={() =>
                        update(question.localId, {
                          options: question.options.filter(
                            (_item, itemIndex) => itemIndex !== optionIndex
                          ),
                          correctOption:
                            question.correctOption === optionIndex
                              ? null
                              : question.correctOption !== null &&
                                  question.correctOption > optionIndex
                                ? question.correctOption - 1
                                : question.correctOption,
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  style={quietButtonStyle}
                  onClick={() => update(question.localId, { options: [...question.options, ""] })}
                >
                  Add option
                </button>
              </fieldset>
            )}

            {question.kind === "number" && (
              <label style={labelStyle}>
                Correct number (optional, gives a suggested mark)
                <input
                  type="number"
                  step="any"
                  style={{ ...inputStyle, marginTop: 6 }}
                  value={question.correctNumber}
                  onChange={(event) =>
                    update(question.localId, { correctNumber: event.target.value })
                  }
                />
              </label>
            )}

            <label style={{ ...labelStyle, marginBottom: 0, maxWidth: 140 }}>
              Points
              <input
                type="number"
                min="0"
                step="any"
                style={{ ...inputStyle, marginTop: 6 }}
                value={question.points}
                onChange={(event) => update(question.localId, { points: event.target.value })}
              />
            </label>
          </div>
        ))}

        <div style={{ ...cardStyle, padding: 18, marginBottom: 14 }}>
          <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 10px" }}>Add a question</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {QUESTION_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                style={quietButtonStyle}
                onClick={() => setQuestions((current) => [...current, newQuestion(kind)])}
              >
                {QUESTION_KIND_LABELS[kind]}
              </button>
            ))}
          </div>
        </div>

        <p style={mutedStyle}>
          {questions.length} {questions.length === 1 ? "question" : "questions"}, {total} points.
          Questions can&apos;t be changed once the test is published.
        </p>
        {error && <p style={errorStyle}>{error}</p>}
        {notice && <p style={mutedStyle}>{notice}</p>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" style={primaryButtonStyle} disabled={busy} onClick={publish}>
            Publish to students
          </button>
          <button type="button" style={quietButtonStyle} disabled={busy} onClick={saveDraft}>
            Save draft
          </button>
          {confirmingDelete ? (
            <button type="button" style={quietButtonStyle} disabled={busy} onClick={deleteDraft}>
              Confirm delete
            </button>
          ) : (
            <button
              type="button"
              style={quietButtonStyle}
              disabled={busy}
              onClick={() => setConfirmingDelete(true)}
            >
              Delete draft
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
