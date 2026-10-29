"use client";

import * as React from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { FilterSelect, PageHeader, cardStyle } from "@/components/montessori/page-header";
import { ToastBus } from "@/components/montessori/primitives";
import type {
  ElementaryExamGrade,
  ElementaryGradesPageData,
} from "@/lib/queries/elementary-grades";
import { defaultSchoolTermId } from "@/lib/queries/school-terms";

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
  subject: string;
  assessmentName: string;
  percentage: string;
  gradeLabel: string;
  mode: "breakdown" | "total";
  caScore: string;
  classParticipationScore: string;
  aflScore: string;
};

function emptyForm(): FormState {
  return {
    subject: "",
    assessmentName: "End-of-term exam",
    percentage: "",
    gradeLabel: "",
    mode: "breakdown",
    caScore: "",
    classParticipationScore: "",
    aflScore: "",
  };
}

export default function GradesClient({ initialData }: { initialData: ElementaryGradesPageData }) {
  const [grades, setGrades] = React.useState(initialData.grades);
  const [termComments, setTermComments] = React.useState(initialData.termComments);
  const [classroomId, setClassroomId] = React.useState(initialData.classrooms[0]?.id ?? "");
  const [termId, setTermId] = React.useState(() => defaultSchoolTermId(initialData.terms) ?? "");
  const classroomStudents = initialData.students.filter((s) => s.classroomId === classroomId);
  const [selectedStudentId, setSelectedStudentId] = React.useState(classroomStudents[0]?.id ?? "");
  const [form, setForm] = React.useState<FormState>(emptyForm);
  const [saving, setSaving] = React.useState(false);
  const [termComment, setTermComment] = React.useState("");
  const [savingTermComment, setSavingTermComment] = React.useState(false);
  const [overallGradeLabel, setOverallGradeLabel] = React.useState("");

  React.useEffect(() => {
    const firstStudent = initialData.students.find((s) => s.classroomId === classroomId);
    setSelectedStudentId(firstStudent?.id ?? "");
    setForm(emptyForm());
  }, [classroomId, initialData.students]);

  const visibleGrades = grades.filter(
    (grade) =>
      grade.classroomId === classroomId &&
      grade.termId === termId &&
      grade.studentId === selectedStudentId
  );
  const selectedStudent = classroomStudents.find((student) => student.id === selectedStudentId);
  const selectedTermComment = termComments.find(
    (item) =>
      item.classroomId === classroomId &&
      item.termId === termId &&
      item.studentId === selectedStudentId
  );

  React.useEffect(() => {
    setTermComment(selectedTermComment?.comment ?? "");
    setOverallGradeLabel(selectedTermComment?.overallGradeLabel ?? "");
  }, [
    classroomId,
    termId,
    selectedStudentId,
    selectedTermComment?.comment,
    selectedTermComment?.overallGradeLabel,
  ]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectClassroom(nextClassroomId: string) {
    setClassroomId(nextClassroomId);
    setForm(emptyForm());
  }

  function selectTerm(nextTermId: string) {
    setTermId(nextTermId);
    setForm(emptyForm());
  }

  function selectStudent(nextStudentId: string) {
    setSelectedStudentId(nextStudentId);
    setForm(emptyForm());
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const percentage =
      form.mode === "breakdown"
        ? Math.round(
            (Number(form.caScore) + Number(form.classParticipationScore) + Number(form.aflScore)) *
              100
          ) / 100
        : Number(form.percentage);
    if (!selectedStudentId || !termId || Number.isNaN(percentage)) return;
    setSaving(true);
    try {
      const response = await fetch("/api/v1/elementary-grades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id,
          classroomId,
          studentId: selectedStudentId,
          termId,
          subject: form.subject,
          assessmentName: form.assessmentName,
          percentage,
          gradeLabel: form.gradeLabel,
          caScore: form.mode === "breakdown" ? Number(form.caScore) : null,
          classParticipationScore:
            form.mode === "breakdown" ? Number(form.classParticipationScore) : null,
          aflScore: form.mode === "breakdown" ? Number(form.aflScore) : null,
        }),
      });
      const payload = (await response.json()) as { grade?: ElementaryExamGrade; error?: string };
      if (!response.ok || !payload.grade) throw new Error(payload.error || "Could not save grade");
      setGrades((current) => [
        ...current.filter((grade) => grade.id !== payload.grade!.id),
        payload.grade!,
      ]);
      setForm(emptyForm());
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
      subject: grade.subject,
      assessmentName: grade.assessmentName,
      percentage: String(grade.percentage),
      gradeLabel: grade.gradeLabel,
      mode: grade.caScore != null ? "breakdown" : "total",
      caScore: grade.caScore == null ? "" : String(grade.caScore),
      classParticipationScore:
        grade.classParticipationScore == null ? "" : String(grade.classParticipationScore),
      aflScore: grade.aflScore == null ? "" : String(grade.aflScore),
    });
    setSelectedStudentId(grade.studentId);
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
    if (!classroomId || !termId || !selectedStudentId) return;
    setSavingTermComment(true);
    try {
      const response = await fetch("/api/v1/elementary-grade-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classroomId,
          studentId: selectedStudentId,
          termId,
          comment: termComment.trim() || null,
          overallGradeLabel: overallGradeLabel || null,
        }),
      });
      const payload = (await response.json()) as {
        comment?: string | null;
        overallGradeLabel?: string | null;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Could not save the comment");
      setTermComments((current) => {
        const remaining = current.filter(
          (item) =>
            item.classroomId !== classroomId ||
            item.termId !== termId ||
            item.studentId !== selectedStudentId
        );
        return payload.comment || payload.overallGradeLabel
          ? [
              ...remaining,
              {
                classroomId,
                termId,
                studentId: selectedStudentId,
                comment: payload.comment ?? "",
                overallGradeLabel: payload.overallGradeLabel ?? null,
              },
            ]
          : remaining;
      });
      ToastBus.push({
        message:
          payload.comment || payload.overallGradeLabel
            ? "End-of-term feedback saved"
            : "Feedback cleared",
      });
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
        subtitle="Enter CA, class participation and AFL for each subject. Choose one overall grade and add the term comment."
      />
      <div style={{ padding: 24, maxWidth: 1120, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
          <FilterSelect
            label="Classroom"
            value={classroomId}
            onChange={selectClassroom}
            options={initialData.classrooms.map((room) => ({ value: room.id, label: room.name }))}
          />
          <FilterSelect
            label="Term"
            value={termId}
            onChange={selectTerm}
            options={initialData.terms.map((term) => ({ value: term.id, label: term.name }))}
          />
          <FilterSelect
            label="Student"
            value={selectedStudentId}
            onChange={selectStudent}
            options={classroomStudents.map((student) => ({
              value: student.id,
              label: student.name,
            }))}
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
              <Field label="Assessment">
                <input
                  style={inputStyle}
                  value={form.assessmentName}
                  onChange={(e) => update("assessmentName", e.target.value)}
                  maxLength={160}
                  required
                />
              </Field>
              <Field label="Scoring">
                <select
                  style={inputStyle}
                  value={form.mode}
                  onChange={(event) => update("mode", event.target.value as FormState["mode"])}
                >
                  <option value="breakdown">CA + class participation + AFL</option>
                  <option value="total">Total only (no breakdown available)</option>
                </select>
              </Field>
              {form.mode === "breakdown" ? (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0,1fr))",
                      gap: 10,
                    }}
                  >
                    {(
                      [
                        ["caScore", "CA /40", 40],
                        ["classParticipationScore", "Class participation /20", 20],
                        ["aflScore", "AFL /40", 40],
                      ] as const
                    ).map(([key, label, maximum]) => (
                      <Field key={key} label={label}>
                        <input
                          style={inputStyle}
                          type="number"
                          min="0"
                          max={maximum}
                          step="0.01"
                          value={form[key]}
                          onChange={(event) => update(key, event.target.value)}
                          required
                        />
                      </Field>
                    ))}
                  </div>
                  <p className="mb-4 text-sm font-semibold" aria-live="polite">
                    Total:{" "}
                    <output aria-label="Calculated total">
                      {form.caScore !== "" &&
                      form.classParticipationScore !== "" &&
                      form.aflScore !== ""
                        ? `${Math.round((Number(form.caScore) + Number(form.classParticipationScore) + Number(form.aflScore)) * 100) / 100}/100`
                        : "Enter all three scores"}
                    </output>
                  </p>
                </>
              ) : (
                <Field label="Total /100">
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
              )}
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
                    onClick={() => setForm(emptyForm())}
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
                Saved results{selectedStudent ? ` for ${selectedStudent.name}` : ""}
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
                      <div style={{ fontWeight: 650 }}>{grade.subject}</div>
                      <div
                        style={{ marginTop: 4, color: "var(--color-ink-secondary)", fontSize: 13 }}
                      >
                        {grade.assessmentName} · <strong>Total {grade.percentage}/100</strong>
                        <div className="mt-1">
                          {grade.caScore != null
                            ? `CA ${grade.caScore}/40 · Participation ${grade.classParticipationScore}/20 · AFL ${grade.aflScore}/40`
                            : "Saved total only — no breakdown recorded"}
                        </div>
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
              <h2 style={{ fontSize: 17, margin: "0 0 6px" }}>
                Overall grade and end-of-term comment
              </h2>
              <p style={{ margin: "0 0 16px", color: "var(--color-ink-secondary)", fontSize: 14 }}>
                This grade and comment describe the cumulative result across all saved subjects.
              </p>
              <p className="mb-4 text-sm font-semibold">
                Cumulative average:{" "}
                {visibleGrades.length
                  ? `${Math.round((visibleGrades.reduce((sum, grade) => sum + grade.percentage, 0) / visibleGrades.length) * 100) / 100}%`
                  : "No saved results yet"}
              </p>
              <Field label="Overall grade">
                <select
                  style={inputStyle}
                  value={overallGradeLabel}
                  onChange={(event) => setOverallGradeLabel(event.target.value)}
                >
                  <option value="">Not graded yet</option>
                  <option value="A">A — Excellent</option>
                  <option value="B">B — Good</option>
                  <option value="C">C — Satisfactory</option>
                  <option value="D">D — Encouraged to Improve</option>
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
                {savingTermComment ? "Saving…" : "Save overall grade and comment"}
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
