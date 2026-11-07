"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { PageHeader, cardStyle } from "@/components/montessori/page-header";
import { sendJson } from "@/components/tests/request";
import { errorStyle, mutedStyle, quietButtonStyle } from "@/components/tests/styles";
import { totalPoints } from "@/lib/tests/model";
import type { RosterSubmission, StaffTest } from "@/lib/tests/queries";

const STUDENT_STATUS = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
} as const;

export default function TestResults({
  test,
  roster,
}: {
  test: StaffTest;
  roster: RosterSubmission[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const open = test.status === "published";
  const total = totalPoints(test.questions);
  const submitted = roster.filter((student) => student.status === "submitted").length;

  const toggle = async () => {
    setBusy(true);
    setError(null);
    const failure = await sendJson(`/api/v1/tests/${test.id}`, "PATCH", {
      status: open ? "closed" : "published",
    });
    setBusy(false);
    if (failure) setError(failure);
    else router.refresh();
  };

  return (
    <div>
      <PageHeader
        overline={<Link href="/app/tests">Tests</Link>}
        title={test.title}
        subtitle={`${test.classroomName}, ${test.subject}. ${open ? "Open to students" : "Closed"}, ${test.questions.length} questions, ${total} points.`}
        actions={
          <button type="button" style={quietButtonStyle} disabled={busy} onClick={toggle}>
            {open ? "Close test" : "Reopen test"}
          </button>
        }
      />
      <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
        {error && <p style={errorStyle}>{error}</p>}
        <p style={mutedStyle}>
          {submitted} of {roster.length} students have submitted.
        </p>
        <div style={{ ...cardStyle, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th style={{ padding: "10px 14px" }}>Student</th>
                <th style={{ padding: "10px 14px" }}>Status</th>
                <th style={{ padding: "10px 14px" }}>Mark</th>
                <th style={{ padding: "10px 14px" }} />
              </tr>
            </thead>
            <tbody>
              {roster.map((student) => (
                <tr key={student.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "10px 14px" }}>{student.name}</td>
                  <td style={{ padding: "10px 14px" }}>{STUDENT_STATUS[student.status]}</td>
                  <td style={{ padding: "10px 14px" }}>
                    {student.markedCount === 0
                      ? "Not marked"
                      : student.markedCount < test.questions.length
                        ? `${student.markedCount} of ${test.questions.length} questions marked`
                        : `${student.markedPoints} / ${total}`}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>
                    {student.status === "submitted" && student.submissionId && (
                      <Link href={`/app/tests/${test.id}/submissions/${student.submissionId}`}>
                        Mark
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
