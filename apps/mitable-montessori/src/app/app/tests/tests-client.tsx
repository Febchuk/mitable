"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { PageHeader, cardStyle } from "@/components/montessori/page-header";
import {
  errorStyle,
  inputStyle,
  labelStyle,
  mutedStyle,
  primaryButtonStyle,
  quietButtonStyle,
} from "@/components/tests/styles";
import type { ClassroomOption, StaffTestSummary } from "@/lib/tests/queries";
import type { TestStatus } from "@/lib/tests/model";

const STATUS_LABELS: Record<TestStatus, string> = {
  draft: "Draft",
  published: "Open",
  closed: "Closed",
};

export default function TestsClient({
  tests,
  classrooms,
}: {
  tests: StaffTestSummary[];
  classrooms: ClassroomOption[];
}) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [classroomId, setClassroomId] = React.useState(classrooms[0]?.id ?? "");
  const [subject, setSubject] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classroomId, subject, title }),
      });
      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !data.id) {
        setError(data.error ?? "Could not create the test");
        return;
      }
      router.push(`/app/tests/${data.id}`);
    } catch {
      setError("Can't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Tests"
        subtitle="Write a test for a class. Students sign in to take it, and you mark it here."
        actions={
          <>
            <Link href="/app/tests/logins" style={{ ...quietButtonStyle, textDecoration: "none" }}>
              Student logins
            </Link>
            <button type="button" style={primaryButtonStyle} onClick={() => setCreating(true)}>
              New test
            </button>
          </>
        }
      />
      <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
        {creating && (
          <form onSubmit={create} style={{ ...cardStyle, padding: 18, marginBottom: 18 }}>
            <label style={labelStyle}>
              Class
              <select
                style={{ ...inputStyle, marginTop: 6 }}
                value={classroomId}
                onChange={(event) => setClassroomId(event.target.value)}
              >
                {classrooms.map((classroom) => (
                  <option key={classroom.id} value={classroom.id}>
                    {classroom.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Subject
              <input
                style={{ ...inputStyle, marginTop: 6 }}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                required
              />
            </label>
            <label style={labelStyle}>
              Test title
              <input
                style={{ ...inputStyle, marginTop: 6 }}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </label>
            {error && <p style={errorStyle}>{error}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" style={primaryButtonStyle} disabled={busy || !classroomId}>
                {busy ? "Creating…" : "Create test"}
              </button>
              <button type="button" style={quietButtonStyle} onClick={() => setCreating(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {tests.length === 0 ? (
          !creating && (
            <div style={{ ...cardStyle, padding: 24 }}>
              <p style={{ ...mutedStyle, margin: 0 }}>
                No tests yet. Choose New test to write the first one.
              </p>
            </div>
          )
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {tests.map((test) => (
              <Link
                key={test.id}
                href={`/app/tests/${test.id}`}
                style={{
                  ...cardStyle,
                  padding: 16,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <span>
                  <strong style={{ display: "block", fontSize: 15 }}>{test.title}</strong>
                  <span style={mutedStyle}>
                    {test.classroomName}, {test.subject}
                  </span>
                </span>
                <span style={mutedStyle}>
                  {STATUS_LABELS[test.status]}
                  {test.status !== "draft" && `, ${test.submittedCount} submitted`}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
