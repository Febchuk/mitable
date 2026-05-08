"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { CHILDREN, type Tone } from "@/components/montessori/data";
import { PageHeader } from "@/components/montessori/page-header";
import { Avatar, ToastBus } from "@/components/montessori/primitives";
import { useMontessori } from "@/components/montessori/store";
import type { ClassroomProgressStudent } from "@/lib/queries/classroom-progress";
import { emptySessionNoteDraft, type SessionNote, type SessionNoteDraft } from "./data";
import styles from "./session-notes.module.css";

const TONES: Tone[] = ["clay", "sage", "butter", "blue", "terracotta"];
function toneFor(id: string): Tone {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

const initialsFor = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("");

type StudentLite = {
  id: string;
  name: string;
  preferredName: string | null;
  tone: Tone;
};

function rosterFromClassroom(students: ClassroomProgressStudent[]): StudentLite[] {
  return students
    .map((s) => ({
      id: s.id,
      name: s.fullName,
      preferredName: s.preferredName,
      tone: toneFor(s.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function rosterFromMock(): StudentLite[] {
  return CHILDREN.filter((c) => c.present).map((c) => ({
    id: c.id,
    name: c.name,
    preferredName: null,
    tone: c.tone,
  }));
}

type Mode = "view" | "create" | "edit";

export function SessionNotesFeature() {
  const store = useMontessori();
  const cp = store.classroomProgress;
  const roster = React.useMemo<StudentLite[]>(
    () => (cp ? rosterFromClassroom(cp.students) : rosterFromMock()),
    [cp]
  );

  const [studentId, setStudentId] = React.useState<string | null>(roster[0]?.id ?? null);
  const [mode, setMode] = React.useState<Mode>("view");
  const [editingNoteId, setEditingNoteId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<SessionNoteDraft>(() => emptySessionNoteDraft());

  // If the roster mounts after first render (server hydration), pick first student.
  React.useEffect(() => {
    if (!studentId && roster.length > 0) setStudentId(roster[0].id);
  }, [roster, studentId]);

  const student = roster.find((s) => s.id === studentId) ?? null;
  const notes = studentId ? (store.sessionNotes[studentId] ?? []) : [];

  const startCreate = React.useCallback(() => {
    setDraft(emptySessionNoteDraft());
    setEditingNoteId(null);
    setMode("create");
  }, []);

  const startEdit = React.useCallback((note: SessionNote) => {
    setDraft({
      sessionDate: note.sessionDate,
      sessionType: note.sessionType,
      attended: note.attended,
      observations: note.observations,
      goalsWorkedOn: note.goalsWorkedOn,
      planForNext: note.planForNext,
      parentNote: note.parentNote,
    });
    setEditingNoteId(note.id);
    setMode("edit");
  }, []);

  const cancel = React.useCallback(() => {
    setMode("view");
    setEditingNoteId(null);
  }, []);

  const onSave = React.useCallback(() => {
    if (!studentId || !student) return;
    if (!draft.observations.trim() && !draft.goalsWorkedOn.trim() && !draft.planForNext.trim()) {
      ToastBus.push({ message: "Add at least one section before saving" });
      return;
    }
    if (mode === "edit" && editingNoteId) {
      store.updateSessionNote({ studentId, noteId: editingNoteId, draft });
      ToastBus.push({ message: `Note updated · ${student.name.split(" ")[0]}` });
    } else {
      store.addSessionNote({ studentId, draft });
      ToastBus.push({ message: `Session note saved · ${student.name.split(" ")[0]}` });
    }
    setMode("view");
    setEditingNoteId(null);
  }, [studentId, student, draft, mode, editingNoteId, store]);

  const onDelete = React.useCallback(
    (noteId: string) => {
      if (!studentId) return;
      store.removeSessionNote({ studentId, noteId });
      if (editingNoteId === noteId) {
        cancel();
      }
    },
    [studentId, store, editingNoteId, cancel]
  );

  return (
    <div className={styles.snRoot}>
      <PageHeader
        overline={`Session notes${student ? ` · ${student.name.split(" ")[0]}` : ""}`}
        title="Progress"
        subtitle={
          student
            ? `${student.name} · ${notes.length} ${notes.length === 1 ? "note" : "notes"} on file`
            : "Pick a child from the left column to start"
        }
      />

      <div className={styles.snLayout}>
        {/* Left column — students with + */}
        <aside className={styles.snLeftCol}>
          <header className={styles.snLeftHeader}>
            <div className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
              Students
            </div>
            <button
              type="button"
              className={`${styles.snAddBtn} tap`}
              onClick={() => {
                if (!studentId && roster.length > 0) setStudentId(roster[0].id);
                startCreate();
              }}
              disabled={roster.length === 0}
              aria-label="New session note"
              title="New session note"
            >
              <Plus size={16} strokeWidth={1.7} />
            </button>
          </header>
          <div className={styles.snStudentList}>
            {roster.map((s) => {
              const active = s.id === studentId;
              const count = (store.sessionNotes[s.id] ?? []).length;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`${styles.snStudentBtn} tap`}
                  data-active={active ? "true" : "false"}
                  onClick={() => {
                    setStudentId(s.id);
                    setMode("view");
                    setEditingNoteId(null);
                  }}
                >
                  <Avatar initials={initialsFor(s.name)} tone={s.tone} size={28} />
                  <div className={styles.snStudentText}>
                    <div className={styles.snStudentName}>
                      {s.preferredName ?? s.name.split(" ")[0]}
                    </div>
                    <div className={styles.snStudentMeta}>
                      {count} {count === 1 ? "note" : "notes"}
                    </div>
                  </div>
                </button>
              );
            })}
            {roster.length === 0 && (
              <div className={styles.snEmpty}>No students enrolled in this classroom yet.</div>
            )}
          </div>
        </aside>

        {/* Right pane — note timeline + form */}
        <section className={styles.snMain}>
          {mode === "view" ? (
            <NoteTimeline
              notes={notes}
              onEdit={startEdit}
              onDelete={onDelete}
              onCreate={student ? startCreate : null}
              studentName={student?.name ?? null}
            />
          ) : (
            <NoteForm
              draft={draft}
              onChange={setDraft}
              onCancel={cancel}
              onSave={onSave}
              isEdit={mode === "edit"}
            />
          )}
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function NoteTimeline({
  notes,
  onEdit,
  onDelete,
  onCreate,
  studentName,
}: {
  notes: SessionNote[];
  onEdit: (n: SessionNote) => void;
  onDelete: (id: string) => void;
  onCreate: (() => void) | null;
  studentName: string | null;
}) {
  if (notes.length === 0) {
    return (
      <div className={styles.snEmptyState}>
        <div className="font-display" style={{ fontSize: 22, color: "var(--color-ink)" }}>
          {studentName ? `No notes yet for ${studentName.split(" ")[0]}` : "No notes yet"}
        </div>
        <div
          style={{
            marginTop: 8,
            color: "var(--color-ink-secondary)",
            fontSize: 13.5,
            maxWidth: 460,
            margin: "8px auto 0",
          }}
        >
          Use the <strong>+</strong> in the top right of the left column — or the button below — to
          capture today&rsquo;s session. The shared template keeps every note structured the same
          way.
        </div>
        {onCreate && (
          <button
            type="button"
            className={`${styles.snPrimaryBtn} tap`}
            onClick={onCreate}
            style={{ marginTop: 16 }}
          >
            <Plus size={14} strokeWidth={1.6} /> New session note
          </button>
        )}
      </div>
    );
  }
  return (
    <div className={styles.snList}>
      {notes.map((n) => (
        <article key={n.id} className={styles.snCard}>
          <header className={styles.snCardHeader}>
            <div>
              <div className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
                {n.sessionType} · {formatLongDate(n.sessionDate)}
              </div>
              <div className={styles.snCardTitle}>
                {n.attended ? "Session held" : "Session missed"}
              </div>
            </div>
            <div className={styles.snCardActions}>
              <button
                type="button"
                className={`${styles.snGhostBtn} tap`}
                onClick={() => onEdit(n)}
              >
                Edit
              </button>
              <button
                type="button"
                className={`${styles.snGhostBtn} tap`}
                onClick={() => onDelete(n.id)}
                style={{ color: "var(--color-terracotta-deep)" }}
              >
                Delete
              </button>
            </div>
          </header>
          {n.observations && <NoteSection label="Observations">{n.observations}</NoteSection>}
          {n.goalsWorkedOn && <NoteSection label="Goals worked on">{n.goalsWorkedOn}</NoteSection>}
          {n.planForNext && (
            <NoteSection label="Plan for next session">{n.planForNext}</NoteSection>
          )}
          {n.parentNote && <NoteSection label="Note for parent">{n.parentNote}</NoteSection>}
        </article>
      ))}
    </div>
  );
}

function NoteSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.snCardSection}>
      <div className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
        {label}
      </div>
      <div
        className="font-display"
        style={{ fontSize: 17, lineHeight: 1.35, color: "var(--color-ink)" }}
      >
        {children}
      </div>
    </div>
  );
}

function NoteForm({
  draft,
  onChange,
  onCancel,
  onSave,
  isEdit,
}: {
  draft: SessionNoteDraft;
  onChange: (d: SessionNoteDraft) => void;
  onCancel: () => void;
  onSave: () => void;
  isEdit: boolean;
}) {
  const patch = (p: Partial<SessionNoteDraft>) => onChange({ ...draft, ...p });

  return (
    <form
      className={styles.snForm}
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <header className={styles.snFormHeader}>
        <div>
          <div className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
            {isEdit ? "Edit session note" : "New session note"}
          </div>
          <div className={styles.snFormTitle}>Capture what happened today</div>
        </div>
      </header>

      <div className={styles.snFormGrid}>
        <Field label="Date">
          <input
            type="date"
            value={draft.sessionDate}
            onChange={(e) => patch({ sessionDate: e.target.value })}
            className={styles.snInput}
          />
        </Field>
        <Field label="Session type">
          <input
            type="text"
            value={draft.sessionType}
            onChange={(e) => patch({ sessionType: e.target.value })}
            placeholder="Speech 1:1"
            className={styles.snInput}
          />
        </Field>
        <Field label="Attendance">
          <div style={{ display: "flex", gap: 6 }}>
            <label
              className={`${styles.snToggle} tap`}
              data-active={draft.attended ? "true" : "false"}
            >
              <input
                type="radio"
                name="attended"
                checked={draft.attended}
                onChange={() => patch({ attended: true })}
                style={{ display: "none" }}
              />
              Held
            </label>
            <label
              className={`${styles.snToggle} tap`}
              data-active={!draft.attended ? "true" : "false"}
            >
              <input
                type="radio"
                name="attended"
                checked={!draft.attended}
                onChange={() => patch({ attended: false })}
                style={{ display: "none" }}
              />
              Missed
            </label>
          </div>
        </Field>
      </div>

      <Field label="Observations">
        <textarea
          value={draft.observations}
          onChange={(e) => patch({ observations: e.target.value })}
          rows={4}
          placeholder="What did you see in this session? Stand-out moments, breakthroughs, regressions…"
          className={styles.snTextarea}
        />
      </Field>
      <Field label="Goals worked on">
        <textarea
          value={draft.goalsWorkedOn}
          onChange={(e) => patch({ goalsWorkedOn: e.target.value })}
          rows={3}
          placeholder="Which IEP goals did this session target?"
          className={styles.snTextarea}
        />
      </Field>
      <Field label="Plan for next session">
        <textarea
          value={draft.planForNext}
          onChange={(e) => patch({ planForNext: e.target.value })}
          rows={3}
          placeholder="What's the next step? New target, harder set, different prompt level…"
          className={styles.snTextarea}
        />
      </Field>
      <Field label="Note for parent (optional)">
        <textarea
          value={draft.parentNote}
          onChange={(e) => patch({ parentNote: e.target.value })}
          rows={3}
          placeholder="The line that gets sent home today."
          className={styles.snTextarea}
        />
      </Field>

      <div className={styles.snFormActions}>
        <button type="button" className={`${styles.snGhostBtn} tap`} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={`${styles.snPrimaryBtn} tap`}>
          {isEdit ? "Save changes" : "Save note"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className={styles.snField}>
      <div className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
        {label}
      </div>
      {children}
    </label>
  );
}

function formatLongDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
