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
import type { ClassroomOption, StudentLoginRow } from "@/lib/tests/queries";

type IssuedLogin = { studentId: string; loginCode: string; password: string };

export default function LoginsClient({
  classrooms,
  classroomId,
  students,
}: {
  classrooms: ClassroomOption[];
  classroomId: string;
  students: StudentLoginRow[];
}) {
  const router = useRouter();
  const [issued, setIssued] = React.useState<IssuedLogin[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const missing = students.filter((student) => !student.loginCode);
  const names = new Map(students.map((student) => [student.id, student.name]));

  const issue = async (studentIds: string[]) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/tests/student-logins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentIds }),
      });
      const data = (await response.json()) as { logins?: IssuedLogin[]; error?: string };
      if (data.logins?.length) {
        setIssued((current) => [
          ...data.logins!,
          ...current.filter(
            (item) => !data.logins!.some((next) => next.studentId === item.studentId)
          ),
        ]);
      }
      if (!response.ok) setError(data.error ?? "Could not create the logins");
      router.refresh();
    } catch {
      setError("Can't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        overline={<Link href="/app/tests">Tests</Link>}
        title="Student logins"
        subtitle="Students sign in at /student/login with a code and password from you."
      />
      <div style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
        <label style={{ ...labelStyle, maxWidth: 320 }}>
          Class
          <select
            style={{ ...inputStyle, marginTop: 6 }}
            value={classroomId}
            onChange={(event) => {
              setIssued([]);
              router.push(`/app/tests/logins?classroom=${event.target.value}`);
            }}
          >
            {classrooms.map((classroom) => (
              <option key={classroom.id} value={classroom.id}>
                {classroom.name}
              </option>
            ))}
          </select>
        </label>

        {issued.length > 0 && (
          <div style={{ ...cardStyle, padding: 18, marginBottom: 14 }}>
            <strong style={{ fontSize: 15 }}>Copy or print these now</strong>
            <p style={mutedStyle}>
              Passwords only show here once. If one is lost, choose New password for that student.
            </p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th style={{ padding: "6px 0" }}>Student</th>
                  <th style={{ padding: "6px 0" }}>Code</th>
                  <th style={{ padding: "6px 0" }}>Password</th>
                </tr>
              </thead>
              <tbody>
                {issued.map((login) => (
                  <tr key={login.studentId} style={{ borderTop: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "6px 0" }}>{names.get(login.studentId)}</td>
                    <td style={{ padding: "6px 0" }}>{login.loginCode}</td>
                    <td style={{ padding: "6px 0" }}>{login.password}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error && <p style={errorStyle}>{error}</p>}
        {missing.length > 0 && (
          <button
            type="button"
            style={{ ...primaryButtonStyle, marginBottom: 14 }}
            disabled={busy}
            onClick={() => issue(missing.map((student) => student.id))}
          >
            {busy ? "Creating…" : `Create logins for ${missing.length} students`}
          </button>
        )}

        <div style={{ ...cardStyle, overflowX: "auto" }}>
          {students.length === 0 ? (
            <p style={{ ...mutedStyle, padding: 18, margin: 0 }}>This class has no students yet.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "10px 14px" }}>{student.name}</td>
                    <td style={{ padding: "10px 14px" }}>{student.loginCode ?? "No login yet"}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right" }}>
                      {student.loginCode && (
                        <button
                          type="button"
                          style={quietButtonStyle}
                          disabled={busy}
                          onClick={() => issue([student.id])}
                        >
                          New password
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
