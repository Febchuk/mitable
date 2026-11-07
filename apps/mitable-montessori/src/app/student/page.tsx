import Link from "next/link";
import { redirect } from "next/navigation";
import { cardStyle } from "@/components/montessori/page-header";
import { mutedStyle } from "@/components/tests/styles";
import { getCurrentStudent, listStudentTests } from "@/lib/tests/queries";

const STATUS_LABELS = {
  not_started: "Not started",
  in_progress: "Started",
  submitted: "Submitted",
} as const;

export default async function StudentHomePage() {
  const student = await getCurrentStudent();
  if (!student) redirect("/student/login");
  const tests = await listStudentTests(student.studentId);
  return (
    <div>
      <h1 className="font-display text-3xl">Hello, {student.displayName}</h1>
      <p className="mt-2 mb-6 text-sm text-ink-secondary">Your tests are below.</p>
      {tests.length === 0 ? (
        <div style={{ ...cardStyle, padding: 20 }}>
          <p style={{ ...mutedStyle, margin: 0 }}>You have no tests right now.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {tests.map((test) => {
            const details = (
              <>
                <span>
                  <strong style={{ display: "block", fontSize: 15 }}>{test.title}</strong>
                  <span style={mutedStyle}>{test.subject}</span>
                </span>
                <span style={mutedStyle}>{STATUS_LABELS[test.status]}</span>
              </>
            );
            const rowStyle: React.CSSProperties = {
              ...cardStyle,
              padding: 16,
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              textDecoration: "none",
              color: "inherit",
            };
            return test.status === "submitted" ? (
              <div key={test.id} style={rowStyle}>
                {details}
              </div>
            ) : (
              <Link key={test.id} href={`/student/tests/${test.id}`} style={rowStyle}>
                {details}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
