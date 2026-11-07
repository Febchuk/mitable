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
} from "@/components/tests/styles";
import {
  isAnswered,
  suggestPoints,
  totalPoints,
  type TestAnswer,
  type TestQuestion,
} from "@/lib/tests/model";
import type { MarkingData } from "@/lib/tests/queries";

function answerText(question: TestQuestion, answer: TestAnswer | undefined): string {
  if (!isAnswered(answer)) return "No answer";
  if (question.kind === "multiple_choice")
    return question.options?.[answer?.selectedOption ?? -1] ?? "No answer";
  if (question.kind === "number") return String(answer?.answerNumber);
  return answer?.answerText ?? "";
}

export default function MarkingClient({ data }: { data: MarkingData }) {
  const router = useRouter();
  const { test } = data;
  const [points, setPoints] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(
      test.questions.map((question) => {
        const saved = data.marks[question.id]?.points;
        const suggested = suggestPoints(question, question.key, data.answers[question.id] ?? null);
        return [question.id, String(saved ?? suggested ?? "")];
      })
    )
  );
  const [comments, setComments] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(
      test.questions.map((question) => [question.id, data.marks[question.id]?.comment ?? ""])
    )
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const total = test.questions.reduce(
    (sum, question) => sum + (Number(points[question.id]) || 0),
    0
  );

  const save = async () => {
    setError(null);
    setNotice(null);
    const marks = test.questions
      .filter((question) => (points[question.id] ?? "").trim() !== "")
      .map((question) => ({
        questionId: question.id,
        points: Number(points[question.id]),
        comment: comments[question.id]?.trim() || null,
      }));
    setBusy(true);
    const failure = await sendJson(
      `/api/v1/tests/${test.id}/submissions/${data.submissionId}/marks`,
      "PUT",
      { marks }
    );
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    setNotice("Marks saved. Students can't see them.");
    router.refresh();
  };

  return (
    <div>
      <PageHeader
        overline={<Link href={`/app/tests/${test.id}`}>{test.title}</Link>}
        title={data.studentName}
        subtitle={`${total} / ${totalPoints(test.questions)} points so far`}
      />
      <div style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
        {test.questions.map((question, index) => (
          <div key={question.id} style={{ ...cardStyle, padding: 18, marginBottom: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 6px" }}>Question {index + 1}</p>
            <p style={{ fontSize: 15, margin: "0 0 10px", whiteSpace: "pre-wrap" }}>
              {question.prompt}
            </p>
            <p style={{ ...mutedStyle, margin: "0 0 4px" }}>Student&apos;s answer</p>
            <p style={{ fontSize: 15, margin: "0 0 10px", whiteSpace: "pre-wrap" }}>
              {answerText(question, data.answers[question.id])}
            </p>
            {question.kind === "multiple_choice" && question.key?.correctOption != null && (
              <p style={mutedStyle}>Correct: {question.options?.[question.key.correctOption]}</p>
            )}
            {question.kind === "number" && question.key?.correctNumber != null && (
              <p style={mutedStyle}>Correct: {question.key.correctNumber}</p>
            )}
            <label style={{ ...labelStyle, maxWidth: 160 }}>
              Points out of {question.points}
              <input
                type="number"
                min="0"
                max={question.points}
                step="any"
                style={{ ...inputStyle, marginTop: 6 }}
                value={points[question.id] ?? ""}
                onChange={(event) =>
                  setPoints((current) => ({ ...current, [question.id]: event.target.value }))
                }
              />
            </label>
            <label style={{ ...labelStyle, marginBottom: 0 }}>
              Comment for your records (optional)
              <input
                style={{ ...inputStyle, marginTop: 6 }}
                value={comments[question.id] ?? ""}
                onChange={(event) =>
                  setComments((current) => ({ ...current, [question.id]: event.target.value }))
                }
              />
            </label>
          </div>
        ))}
        {error && <p style={errorStyle}>{error}</p>}
        {notice && <p style={mutedStyle}>{notice}</p>}
        <button type="button" style={primaryButtonStyle} disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save marks"}
        </button>
      </div>
    </div>
  );
}
