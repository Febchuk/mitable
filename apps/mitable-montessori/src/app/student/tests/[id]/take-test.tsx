"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { cardStyle } from "@/components/montessori/page-header";
import { sendJson } from "@/components/tests/request";
import {
  errorStyle,
  inputStyle,
  mutedStyle,
  primaryButtonStyle,
  quietButtonStyle,
} from "@/components/tests/styles";
import { EMPTY_ANSWER, isAnswered, type TestAnswer, type TestQuestion } from "@/lib/tests/model";
import type { StudentTest } from "@/lib/tests/queries";

const SAVE_DELAY_MS = 700;

export default function TakeTest({ test }: { test: StudentTest }) {
  const router = useRouter();
  const [answers, setAnswers] = React.useState(test.answers);
  const [numberDrafts, setNumberDrafts] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(test.answers).map(([id, answer]) => [
        id,
        answer.answerNumber?.toString() ?? "",
      ])
    )
  );
  const [unsaved, setUnsaved] = React.useState<Set<string>>(new Set());
  const [saveFailed, setSaveFailed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const latest = React.useRef(answers);
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const saveOne = React.useCallback(
    async (questionId: string): Promise<boolean> => {
      const answer = latest.current[questionId] ?? EMPTY_ANSWER;
      const failure = await sendJson(
        `/api/v1/student/submissions/${test.submissionId}/answers`,
        "PUT",
        { questionId, ...answer }
      );
      if (failure) {
        setSaveFailed(true);
        return false;
      }
      // Only clear it if nothing newer was typed while this save was on its way.
      if (latest.current[questionId] === answer)
        setUnsaved((current) => {
          const next = new Set(current);
          next.delete(questionId);
          return next;
        });
      return true;
    },
    [test.submissionId]
  );

  const change = (questionId: string, answer: TestAnswer) => {
    latest.current = { ...latest.current, [questionId]: answer };
    setAnswers(latest.current);
    setSaveFailed(false);
    setUnsaved((current) => new Set(current).add(questionId));
    clearTimeout(timers.current.get(questionId));
    timers.current.set(
      questionId,
      setTimeout(() => void saveOne(questionId), SAVE_DELAY_MS)
    );
  };

  const start = async () => {
    setBusy(true);
    setError(null);
    const failure = await sendJson(`/api/v1/student/tests/${test.id}/start`, "POST");
    setBusy(false);
    if (failure) setError(failure);
    else router.refresh();
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    timers.current.forEach((timer) => clearTimeout(timer));
    const saved = await Promise.all(Array.from(unsaved).map(saveOne));
    if (saved.includes(false)) {
      setBusy(false);
      setConfirming(false);
      setError("Some answers didn't save, so your test wasn't submitted. Try again.");
      return;
    }
    const failure = await sendJson(
      `/api/v1/student/submissions/${test.submissionId}/submit`,
      "POST"
    );
    setBusy(false);
    if (failure) {
      setConfirming(false);
      setError(failure);
      return;
    }
    router.push("/student");
    router.refresh();
  };

  if (!test.submissionId) {
    return (
      <div>
        <h1 className="font-display text-3xl">{test.title}</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          {test.subject}, {test.questions.length} questions
        </p>
        {test.instructions && (
          <p style={{ fontSize: 15, whiteSpace: "pre-wrap", marginTop: 16 }}>{test.instructions}</p>
        )}
        <p style={{ ...mutedStyle, marginTop: 16 }}>
          Your answers save as you go. Once you submit, you can&apos;t change them.
        </p>
        {error && <p style={errorStyle}>{error}</p>}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button type="button" style={primaryButtonStyle} disabled={busy} onClick={start}>
            Start test
          </button>
          <Link href="/student" style={{ ...quietButtonStyle, textDecoration: "none" }}>
            Back
          </Link>
        </div>
      </div>
    );
  }

  const unanswered = test.questions.filter((question) => !isAnswered(answers[question.id])).length;

  return (
    <div>
      <h1 className="font-display text-3xl">{test.title}</h1>
      <p className="mt-2 mb-6 text-sm text-ink-secondary">{test.subject}</p>
      {test.instructions && (
        <p style={{ fontSize: 15, whiteSpace: "pre-wrap", marginBottom: 16 }}>
          {test.instructions}
        </p>
      )}

      {test.questions.map((question, index) => (
        <QuestionCard
          key={question.id}
          question={question}
          number={index + 1}
          answer={answers[question.id] ?? EMPTY_ANSWER}
          numberDraft={numberDrafts[question.id] ?? ""}
          onNumberDraft={(value) =>
            setNumberDrafts((current) => ({ ...current, [question.id]: value }))
          }
          onChange={(answer) => change(question.id, answer)}
        />
      ))}

      <p style={mutedStyle} aria-live="polite">
        {saveFailed
          ? "Your last answer didn't save. Check your connection."
          : unsaved.size > 0
            ? "Saving…"
            : "All answers saved."}{" "}
        {unanswered > 0 && `${unanswered} not answered yet.`}
      </p>
      {error && <p style={errorStyle}>{error}</p>}
      {confirming ? (
        <div style={{ ...cardStyle, padding: 16 }}>
          <p style={{ fontSize: 15, marginTop: 0 }}>
            Submit your test? You can&apos;t change your answers after this.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={primaryButtonStyle} disabled={busy} onClick={submit}>
              {busy ? "Submitting…" : "Yes, submit"}
            </button>
            <button
              type="button"
              style={quietButtonStyle}
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Keep working
            </button>
          </div>
        </div>
      ) : (
        <button type="button" style={primaryButtonStyle} onClick={() => setConfirming(true)}>
          Submit test
        </button>
      )}
    </div>
  );
}

function QuestionCard({
  question,
  number,
  answer,
  numberDraft,
  onNumberDraft,
  onChange,
}: {
  question: TestQuestion;
  number: number;
  answer: TestAnswer;
  numberDraft: string;
  onNumberDraft: (value: string) => void;
  onChange: (answer: TestAnswer) => void;
}) {
  const labelId = `question-${question.id}`;
  return (
    <div style={{ ...cardStyle, padding: 18, marginBottom: 14 }}>
      <p style={{ ...mutedStyle, margin: "0 0 4px" }}>
        Question {number}, {question.points} {question.points === 1 ? "point" : "points"}
      </p>
      <p id={labelId} style={{ fontSize: 16, margin: "0 0 12px", whiteSpace: "pre-wrap" }}>
        {question.prompt}
      </p>

      {question.kind === "multiple_choice" && (
        <div role="radiogroup" aria-labelledby={labelId} style={{ display: "grid", gap: 8 }}>
          {question.options?.map((option, index) => (
            <label
              key={index}
              style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 15 }}
            >
              <input
                type="radio"
                name={question.id}
                checked={answer.selectedOption === index}
                onChange={() => onChange({ ...EMPTY_ANSWER, selectedOption: index })}
              />
              {option}
            </label>
          ))}
        </div>
      )}
      {question.kind === "short_answer" && (
        <input
          aria-labelledby={labelId}
          style={inputStyle}
          maxLength={20000}
          value={answer.answerText ?? ""}
          onChange={(event) => onChange({ ...EMPTY_ANSWER, answerText: event.target.value })}
        />
      )}
      {question.kind === "long_answer" && (
        <textarea
          aria-labelledby={labelId}
          style={{ ...inputStyle, minHeight: 160 }}
          maxLength={20000}
          value={answer.answerText ?? ""}
          onChange={(event) => onChange({ ...EMPTY_ANSWER, answerText: event.target.value })}
        />
      )}
      {question.kind === "number" && (
        <input
          aria-labelledby={labelId}
          type="number"
          step="any"
          inputMode="decimal"
          style={{ ...inputStyle, maxWidth: 220 }}
          value={numberDraft}
          onChange={(event) => {
            const value = event.target.value;
            onNumberDraft(value);
            onChange({
              ...EMPTY_ANSWER,
              answerNumber: value.trim() === "" ? null : Number(value),
            });
          }}
        />
      )}
    </div>
  );
}
