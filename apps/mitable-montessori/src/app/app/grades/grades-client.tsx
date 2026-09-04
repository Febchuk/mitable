"use client";

import * as React from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { FilterSelect, PageHeader, cardStyle } from "@/components/montessori/page-header";
import { ToastBus } from "@/components/montessori/primitives";
import type {
  ElementaryExamGrade,
  ElementaryGradesPageData,
} from "@/lib/queries/elementary-grades";

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--color-border)",
  borderRadius: 9,
  padding: "10px 11px",
  background: "var(--color-surface)",
  color: "var(--color-ink)",
  font: "inherit",
  fontSize: 14,
};

type FormState = {
  id?: string;
  studentId: string;
  subject: string;
  assessmentName: string;
  percentage: string;
  gradeLabel: string;
};

function emptyForm(studentId: string): FormState {
  return {
    studentId,
    subject: "",
    assessmentName: "End-of-term exam",
    percentage: "",
    gradeLabel: "",
  };
}

export default function GradesClient({ initialData }: { initialData: ElementaryGradesPageData }) {
  const [grades, setGrades] = React.useState(initialData.grades);
  const [termComments, setTermComments] = React.useState(initialData.termComments);
  const [classroomId, setClassroomId] = React.useState(initialData.classrooms[0]?.id ?? "");
  const [termId, setTermId] = React.useState(initialData.terms[0]?.id ?? "");
  const classroomStudents = initialData.students.filter((s) => s.classroomId === classroomId);
  const [form, setForm] = React.useState<FormState>(() =>
    emptyForm(classroomStudents[0]?.id ?? "")
  );
  const [saving, setSaving] = React.useState(false);
  const [commentStudentId, setCommentStudentId] = React.useState(classroomStudents[0]?.id ?? "");
  const [termComment, setTermComment] = React.useState("");
  const [savingTermComment, setSavingTermComment] = React.useState(false);

  React.useEffect(() => {
    const firstStudent = initialData.students.find((s) => s.classroomId === classroomId);
    setForm(emptyForm(firstStudent?.id ?? ""));
    setCommentStudentId(firstStudent?.id ?? "");
  }, [classroomId, initialData.students]);

  const visibleGrades = grades.filter(
    (grade) => grade.classroomId === classroomId && grade.termId === termId
  );
  const studentName = new Map(initialData.students.map((student) => [student.id, student.name]));
  const selectedTermComment = termComments.find(
    (item) =>
      item.classroomId === classroomId &&
      item.termId === termId &&
      item.studentId === commentStudentId
  );

  React.useEffect(() => {
    setTermComment(selectedTermComment?.comment ?? "");
  }, [selectedTermComment?.comment]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const percentage = Number(form.percentage);
    if (!form.studentId || !termId || Number.isNaN(percentage)) return;
    setSaving(true);
    try {
      const response = await fetch("/api/v1/elementary-grades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id,
          classroomId,
          studentId: form.studentId,
          termId,
          subject: form.subject,
          assessmentName: form.assessmentName,
          percentage,
          gradeLabel: form.gradeLabel,
        }),
      });
      const payload = (await response.json()) as { grade?: ElementaryExamGrade; error?: string };
      if (!response.ok || !payload.grade) throw new Error(payload.error || "Could not save grade");
      setGrades((current) => [
        ...current.filter((grade) => grade.id !== payload.grade!.id),
        payload.grade!,
      ]);
      setForm(emptyForm(form.studentId));
      ToastBus.push({ message: "Grade saved" });
    } catch (error) {
      ToastBus.push({ message: error instanceof Error ? error.message : "Could not save grade" });
    } finally {
      setSaving(false);
    }
  }

  function edit(grade: ElementaryExamGrade) {
    setForm({
      id: grade.id,
      studentId: grade.studentId,
      subject: grade.subject,
      assessmentName: grade.assessmentName,
      percentage: String(grade.percentage),
      gradeLabel: grade.gradeLabel,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(grade: ElementaryExamGrade) {
    if (!window.confirm(`Delete the ${grade.subject} grade?`)) return;
    const response = await fetch(`/api/v1/elementary-grades?id=${grade.id}`, { method: "DELETE" });
    if (!response.ok) {
      ToastBus.push({ message: "Could not delete grade" });
      return;
    }
    setGrades((current) => current.filter((item) => item.id !== grade.id));
    ToastBus.push({ message: "Grade deleted" });
  }

  async function saveTermComment(event: React.FormEvent) {
    event.preventDefault();
    if (!classroomId || !termId || !commentStudentId) return;
    setSavingTermComment(true);
    try {
      const response = await fetch("/api/v1/elementary-grade-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classroomId,
          studentId: commentStudentId,
          termId,
          comment: termComment.trim() || null,
        }),
      });
      const payload = (await response.json()) as { comment?: string | null; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not save the comment");
      setTermComments((current) => {
        const remaining = current.filter(
          (item) =>
            item.classroomId !== classroomId ||
            item.termId !== termId ||
            item.studentId !== commentStudentId
        );
        return payload.comment
          ? [
              ...remaining,
              { classroomId, termId, studentId: commentStudentId, comment: payload.comment },
            ]
          : remaining;
      });
      ToastBus.push({ message: payload.comment ? "End-of-term comment saved" : "Comment cleared" });
    } catch (error) {
      ToastBus.push({
        message: error instanceof Error ? error.message : "Could not save the comment",
      });
    } finally {
      setSavingTermComment(false);
    }
  }

  return (
    <div>
      <PageHeader
        overline="Elementary"
        title="Grades"
        subtitle="Record subject results, then add one end-of-term comment for each student. Reports show the overall average."
      />
      <div style={{ padding: 24, maxWidth: 1120, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
          <FilterSelect
            label="Classroom"
            value={classroomId}
            onChange={setClassroomId}
            options={initialData.classrooms.map((room) => ({ value: room.id, label: room.name }))}
          />
          <FilterSelect
            label="Term"
            value={termId}
            onChange={setTermId}
            options={initialData.terms.map((term) => ({ value: term.id, label: term.name }))}
          />
        </div>

        {initialData.terms.length === 0 ? (
          <div style={{ ...cardStyle, padding: 24 }}>
            Your school needs to add a term in Admin before grades can be recorded.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
              gap: 18,
              alignItems: "start",
            }}
          >
            <form onSubmit={save} style={{ ...cardStyle, padding: 18 }}>
              <h2 style={{ fontSize: 17, margin: "0 0 16px" }}>
                {form.id ? "Edit grade" : "Add grade"}
              </h2>
              <Field label="Student">
                <select
                  style={inputStyle}
                  value={form.studentId}
                  onChange={(e) => update("studentId", e.target.value)}
                  required
                >
                  {classroomStudents.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Subject">
                <input
                  style={inputStyle}
                  value={form.subject}
                  onChange={(e) => update("subject", e.target.value)}
                  placeholder="Mathematics"
                  maxLength={120}
                  required
                />
              </Field>
              <Field label="Exam">
                <input
                  style={inputStyle}
                  value={form.assessmentName}
                  onChange={(e) => update("assessmentName", e.target.value)}
                  maxLength={160}
                  required
                />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Percentage">
                  <input
                    style={inputStyle}
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={form.percentage}
                    onChange={(e) => update("percentage", e.target.value)}
                    placeholder="86"
                    required
                  />
                </Field>
                <Field label="Grade equivalent">
                  <input
                    style={inputStyle}
                    value={form.gradeLabel}
                    onChange={(e) => update("gradeLabel", e.target.value)}
                    placeholder="B+"
                    maxLength={80}
                    required
                  />
                </Field>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="submit"
                  disabled={saving || !classroomStudents.length}
                  style={{
                    border: 0,
                    borderRadius: 9,
                    padding: "10px 14px",
                    background: "var(--color-terracotta)",
                    color: "white",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    cursor: "pointer",
                  }}
                >
                  <Plus size={15} />
                  {saving ? "Saving…" : form.id ? "Save changes" : "Add grade"}
                </button>
                {form.id ? (
                  <button
                    type="button"
                    onClick={() => setForm(emptyForm(form.studentId))}
                    style={{
                      border: "1px solid var(--color-border)",
                      borderRadius: 9,
                      padding: "10px 14px",
                      background: "var(--color-surface)",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>

            <div style={cardStyle}>
              <div
                style={{
                  padding: "14px 16px",
                  borderBottom: "1px solid var(--color-border)",
                  fontWeight: 600,
                }}
              >
                Saved results
              </div>
              {visibleGrades.length === 0 ? (
                <p style={{ padding: 18, margin: 0, color: "var(--color-ink-muted)" }}>
                  No exam grades for this term yet.
                </p>
              ) : (
                visibleGrades.map((grade) => (
                  <div
                    key={grade.id}
                    style={{
                      padding: 16,
                      borderBottom: "1px solid var(--color-border)",
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 650 }}>
                        {studentName.get(grade.studentId)} · {grade.subject}
                      </div>
                      <div
                        style={{ marginTop: 4, color: "var(--color-ink-secondary)", fontSize: 13 }}
                      >
                        {grade.assessmentName} · <strong>{grade.percentage}%</strong> ·{" "}
                        {grade.gradeLabel}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        type="button"
                        aria-label="Edit grade"
                        onClick={() => edit(grade)}
                        style={iconButtonStyle}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete grade"
                        onClick={() => remove(grade)}
                        style={iconButtonStyle}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <form
              onSubmit={saveTermComment}
              style={{ ...cardStyle, padding: 18, gridColumn: "1 / -1" }}
            >
              <h2 style={{ fontSize: 17, margin: "0 0 6px" }}>End-of-term comment</h2>
              <p style={{ margin: "0 0 16px", color: "var(--color-ink-secondary)", fontSize: 14 }}>
                This is the one comment that appears beside the student&apos;s overall grade
                average.
              </p>
              <Field label="Student">
                <select
                  style={inputStyle}
                  value={commentStudentId}
                  onChange={(event) => setCommentStudentId(event.target.value)}
                  required
                >
                  {classroomStudents.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Comments">
                <textarea
                  style={{ ...inputStyle, minHeight: 110, resize: "vertical" }}
                  value={termComment}
                  onChange={(event) => setTermComment(event.target.value)}
                  placeholder="Overall feedback for this term"
                  maxLength={4000}
                />
              </Field>
              <button
                type="submit"
                disabled={savingTermComment || !classroomStudents.length}
                style={{
                  border: 0,
                  borderRadius: 9,
                  padding: "10px 14px",
                  background: "var(--color-terracotta)",
                  color: "white",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {savingTermComment
                  ? "Saving…"
                  : termComment.trim()
                    ? "Save comment"
                    : "Clear comment"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span
        className="label-cap"
        style={{ display: "block", color: "var(--color-ink-muted)", marginBottom: 6 }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

const iconButtonStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  display: "grid",
  placeItems: "center",
  color: "var(--color-ink-secondary)",
  cursor: "pointer",
};
