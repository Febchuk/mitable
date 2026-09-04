"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, ChevronLeft, ChevronRight, FileText, Plus, Save, Trash2 } from "lucide-react";
import {
  StudentMediaCapture,
  StudentMediaLibrary,
} from "@/components/montessori/child-detail/student-media";
import { PageHeader, cardStyle } from "@/components/montessori/page-header";
import { ToastBus } from "@/components/montessori/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ToddlerRoutineIllustration,
  type ToddlerRoutineIllustrationKind,
} from "@/components/montessori/toddler-routine-illustration";
import type {
  ToddlerDailyLog,
  ToddlerRoutineCategory,
  ToddlerRoutineOption,
  ToddlerTimedEntry,
} from "@/lib/toddler-routines";

type Student = { id: string; name: string };
type Attendance = Record<string, { status: string; arrivalTime: string | null }>;
type DayData = {
  students: Student[];
  options: ToddlerRoutineOption[];
  logs: ToddlerDailyLog[];
  attendance: Attendance;
};

function emptyLog(studentId: string, classroomId: string, logDate: string): ToddlerDailyLog {
  return {
    id: null,
    studentId,
    classroomId,
    logDate,
    mood: "",
    nap: "",
    participation: "",
    toiletingEntries: [],
    feedingEntries: [],
    outdoorPlayEntries: [],
    activityOptionIds: [],
    activityLabels: [],
    materialOptionIds: [],
    materialLabels: [],
    otherNotes: "",
    teacherComments: "",
  };
}

function dateOffset(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + amount);
  return value.toISOString().slice(0, 10);
}

export default function DailyLogClient({
  initialDate,
  initialClassroomId,
  classrooms,
}: {
  initialDate: string;
  initialClassroomId: string;
  classrooms: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [date, setDate] = React.useState(initialDate);
  const [classroomId, setClassroomId] = React.useState(initialClassroomId);
  const [data, setData] = React.useState<DayData | null>(null);
  const [studentId, setStudentId] = React.useState("");
  const [draft, setDraft] = React.useState<ToddlerDailyLog | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [reporting, setReporting] = React.useState(false);
  const [mediaOpen, setMediaOpen] = React.useState(false);
  const [mediaRefreshKey, setMediaRefreshKey] = React.useState(0);

  const load = React.useCallback(async (nextDate: string, nextClassroomId: string) => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/v1/toddler-daily-logs?date=${encodeURIComponent(nextDate)}&classroom=${encodeURIComponent(nextClassroomId)}`,
        { cache: "no-store" }
      );
      const payload = (await response.json()) as DayData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Couldn't load Daily Log");
      setData(payload);
      setStudentId((current) =>
        payload.students.some((student) => student.id === current)
          ? current
          : (payload.students[0]?.id ?? "")
      );
    } catch (error) {
      ToastBus.push({ message: (error as Error).message });
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load(date, classroomId);
    router.replace(`/app/daily-log?date=${date}&classroom=${classroomId}`, { scroll: false });
  }, [classroomId, date, load, router]);

  React.useEffect(() => {
    if (!studentId || !data) {
      setDraft(null);
      return;
    }
    const stored = data.logs.find((log) => log.studentId === studentId);
    setDraft(stored ? structuredClone(stored) : emptyLog(studentId, classroomId, date));
  }, [classroomId, data, date, studentId]);

  const options = React.useCallback(
    (category: ToddlerRoutineCategory) =>
      (data?.options ?? []).filter((option) => option.category === category),
    [data]
  );

  function update(patch: Partial<ToddlerDailyLog>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function updateEntries(
    key: "toiletingEntries" | "feedingEntries" | "outdoorPlayEntries",
    entries: ToddlerTimedEntry[]
  ) {
    update({ [key]: entries });
  }

  function addEntry(
    key: "toiletingEntries" | "feedingEntries" | "outdoorPlayEntries",
    category: ToddlerRoutineCategory
  ) {
    if (!draft) return;
    const first = options(category)[0]?.label ?? "";
    updateEntries(key, [
      ...draft[key],
      { id: crypto.randomUUID(), time: "", outcome: first, detail: "" },
    ]);
  }

  async function save(showToast = true): Promise<ToddlerDailyLog | null> {
    if (!draft) return null;
    setSaving(true);
    try {
      const response = await fetch("/api/v1/toddler-daily-logs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = (await response.json()) as { log?: ToddlerDailyLog; error?: string };
      if (!response.ok || !payload.log) throw new Error(payload.error || "Couldn't save Daily Log");
      setDraft(payload.log);
      setData((current) =>
        current
          ? {
              ...current,
              logs: [
                ...current.logs.filter((log) => log.studentId !== payload.log!.studentId),
                payload.log!,
              ],
            }
          : current
      );
      if (showToast) ToastBus.push({ message: "Daily Log saved" });
      return payload.log;
    } catch (error) {
      ToastBus.push({ message: (error as Error).message });
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function reviewReport() {
    const saved = await save(false);
    if (!saved) return;
    setReporting(true);
    try {
      const response = await fetch("/api/v1/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          childId: saved.studentId,
          kind: "Daily",
          templateId: "__builtin:daily",
          reportDate: saved.logDate,
          transcripts: [],
          notes: [],
        }),
      });
      const payload = (await response.json()) as { reportId?: string; error?: string };
      if (!response.ok || !payload.reportId)
        throw new Error(payload.error || "Couldn't create report");
      router.push(`/app/reports/${payload.reportId}`);
    } catch (error) {
      ToastBus.push({ message: (error as Error).message });
    } finally {
      setReporting(false);
    }
  }

  async function includeMedia() {
    const saved = draft?.id ? draft : await save(false);
    if (!saved?.id) return;
    setMediaOpen(true);
  }

  const currentStudent = data?.students.find((student) => student.id === studentId);
  const attendance = data?.attendance[studentId];

  return (
    <div>
      <PageHeader
        title="Daily Log"
        subtitle="Record each toddler's care, routines, and classroom day."
      />
      <div style={{ padding: 24, display: "grid", gap: 16, maxWidth: 980 }}>
        <section
          style={{
            ...cardStyle,
            padding: 14,
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
          }}
        >
          <select
            aria-label="Classroom"
            value={classroomId}
            onChange={(event) => setClassroomId(event.target.value)}
            style={selectStyle}
          >
            {classrooms.map((classroom) => (
              <option key={classroom.id} value={classroom.id}>
                {classroom.name}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Previous day"
              onClick={() => setDate(dateOffset(date, -1))}
            >
              <ChevronLeft size={16} />
            </Button>
            <Input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              style={{ width: 165 }}
            />
            <Button
              variant="ghost"
              size="sm"
              aria-label="Next day"
              onClick={() => setDate(dateOffset(date, 1))}
            >
              <ChevronRight size={16} />
            </Button>
          </div>
          <select
            aria-label="Child"
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
            style={{ ...selectStyle, marginLeft: "auto" }}
          >
            {(data?.students ?? []).map((student) => (
              <option key={student.id} value={student.id}>
                {student.name}
              </option>
            ))}
          </select>
        </section>

        {loading ? (
          <p style={mutedStyle}>Loading…</p>
        ) : !draft || !currentStudent ? (
          <section style={{ ...cardStyle, padding: 24 }}>
            <p style={mutedStyle}>There are no active children in this toddler classroom.</p>
          </section>
        ) : (
          <>
            <section style={{ ...cardStyle, padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <ToddlerRoutineIllustration kind="participation" small />
                <div>
                  <h2 style={sectionTitle}>{currentStudent.name}</h2>
                  <p style={{ ...mutedStyle, margin: "4px 0 0" }}>
                    Attendance:{" "}
                    {attendance?.status
                      ? `${attendance.status}${attendance.arrivalTime ? ` · arrived ${String(attendance.arrivalTime).slice(0, 5)}` : ""}`
                      : "Not recorded"}
                  </p>
                </div>
              </div>
              <div style={threeColumnStyle}>
                <SelectField
                  label="Mood"
                  illustration="mood"
                  value={draft.mood}
                  onChange={(mood) => update({ mood })}
                  options={options("mood")}
                />
                <SelectField
                  label="Nap"
                  illustration="nap"
                  value={draft.nap}
                  onChange={(nap) => update({ nap })}
                  options={options("nap")}
                />
                <SelectField
                  label="Class participation"
                  illustration="participation"
                  value={draft.participation}
                  onChange={(participation) => update({ participation })}
                  options={options("participation")}
                />
              </div>
            </section>

            {draft.id ? (
              <StudentMediaLibrary
                studentId={draft.studentId}
                studentName={currentStudent.name}
                refreshKey={mediaRefreshKey}
                mobile={false}
                toddlerDailyLogId={draft.id}
                onAddMedia={() => void includeMedia()}
              />
            ) : null}

            <TimedSection
              title="Potty time / diapering"
              illustration="toileting"
              addLabel="Add entry"
              entries={draft.toiletingEntries}
              choices={options("toileting")}
              onAdd={() => addEntry("toiletingEntries", "toileting")}
              onChange={(entries) => updateEntries("toiletingEntries", entries)}
            />
            <TimedSection
              title="Feeding"
              illustration="feeding"
              addLabel="Add feeding"
              entries={draft.feedingEntries}
              choices={options("meal_response")}
              detailLabel="Food"
              onAdd={() => addEntry("feedingEntries", "meal_response")}
              onChange={(entries) => updateEntries("feedingEntries", entries)}
            />
            <TimedSection
              title="Outdoor play"
              illustration="outdoor"
              addLabel="Add outdoor play"
              entries={draft.outdoorPlayEntries}
              choices={options("outdoor_response")}
              onAdd={() => addEntry("outdoorPlayEntries", "outdoor_response")}
              onChange={(entries) => updateEntries("outdoorPlayEntries", entries)}
            />

            <ChoiceSection
              title="Activities"
              illustration="activities"
              options={options("activity")}
              selected={draft.activityOptionIds}
              onChange={(activityOptionIds) => update({ activityOptionIds })}
            />
            <ChoiceSection
              title="Montessori materials"
              illustration="materials"
              options={options("material")}
              selected={draft.materialOptionIds}
              onChange={(materialOptionIds) => update({ materialOptionIds })}
            />

            <section style={{ ...cardStyle, padding: 18 }}>
              <TextAreaField
                label="Other notes"
                illustration="notes"
                value={draft.otherNotes}
                onChange={(otherNotes) => update({ otherNotes })}
              />
              <div style={{ height: 14 }} />
              <TextAreaField
                label="Teacher comments"
                illustration="participation"
                value={draft.teacherComments}
                onChange={(teacherComments) => update({ teacherComments })}
              />
            </section>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                flexWrap: "wrap",
                gap: 10,
                paddingBottom: 24,
              }}
            >
              <Button
                type="button"
                variant="outline"
                disabled={saving || reporting}
                onClick={() => void includeMedia()}
              >
                <Camera size={15} />
                Include media
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={saving || reporting}
                onClick={() => void save()}
              >
                <Save size={15} />
                {saving ? "Saving…" : "Save Daily Log"}
              </Button>
              <Button
                type="button"
                disabled={saving || reporting}
                onClick={() => void reviewReport()}
              >
                <FileText size={15} />
                {reporting ? "Opening…" : "Review daily report"}
              </Button>
            </div>
            {mediaOpen && draft.id ? (
              <StudentMediaCapture
                open
                studentId={draft.studentId}
                studentName={currentStudent.name}
                toddlerDailyLogId={draft.id}
                onClose={() => setMediaOpen(false)}
                onShared={() => {
                  setMediaRefreshKey((value) => value + 1);
                  ToastBus.push({ message: "Daily log media shared with family" });
                }}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function SelectField({
  label,
  illustration,
  value,
  options,
  onChange,
}: {
  label: string;
  illustration: ToddlerRoutineIllustrationKind;
  value: string;
  options: ToddlerRoutineOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ ...fieldLabelStyle, ...illustratedFieldStyle }}>
      <span style={illustratedFieldHeadingStyle}>
        <span>{label}</span>
        <ToddlerRoutineIllustration kind={illustration} small />
      </span>
      <select value={value} onChange={(event) => onChange(event.target.value)} style={selectStyle}>
        <option value="">Not recorded</option>
        {options.map((option) => (
          <option key={option.id} value={option.label}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TimedSection({
  title,
  illustration,
  addLabel,
  entries,
  choices,
  detailLabel,
  onAdd,
  onChange,
}: {
  title: string;
  illustration: ToddlerRoutineIllustrationKind;
  addLabel: string;
  entries: ToddlerTimedEntry[];
  choices: ToddlerRoutineOption[];
  detailLabel?: string;
  onAdd: () => void;
  onChange: (entries: ToddlerTimedEntry[]) => void;
}) {
  const patch = (id: string, update: Partial<ToddlerTimedEntry>) =>
    onChange(entries.map((entry) => (entry.id === id ? { ...entry, ...update } : entry)));
  return (
    <section style={{ ...cardStyle, padding: 18 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <IllustratedHeading title={title} illustration={illustration} />
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus size={14} />
          {addLabel}
        </Button>
      </div>
      {entries.length === 0 ? (
        <p style={mutedStyle}>No entries yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {entries.map((entry) => (
            <div
              key={entry.id}
              style={{
                display: "grid",
                gridTemplateColumns: detailLabel
                  ? "120px minmax(140px,1fr) minmax(180px,1.3fr) 38px"
                  : "120px minmax(180px,1fr) 38px",
                gap: 8,
                alignItems: "end",
              }}
            >
              <label style={fieldLabelStyle}>
                <span>Time</span>
                <Input
                  type="time"
                  value={entry.time}
                  onChange={(event) => patch(entry.id, { time: event.target.value })}
                />
              </label>
              <label style={fieldLabelStyle}>
                <span>Response</span>
                <select
                  value={entry.outcome}
                  onChange={(event) => patch(entry.id, { outcome: event.target.value })}
                  style={selectStyle}
                >
                  {choices.map((choice) => (
                    <option key={choice.id} value={choice.label}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </label>
              {detailLabel ? (
                <label style={fieldLabelStyle}>
                  <span>{detailLabel}</span>
                  <Input
                    value={entry.detail ?? ""}
                    onChange={(event) => patch(entry.id, { detail: event.target.value })}
                  />
                </label>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove ${title} entry`}
                onClick={() => onChange(entries.filter((row) => row.id !== entry.id))}
              >
                <Trash2 size={15} />
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ChoiceSection({
  title,
  illustration,
  options,
  selected,
  onChange,
}: {
  title: string;
  illustration: ToddlerRoutineIllustrationKind;
  options: ToddlerRoutineOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <section style={{ ...cardStyle, padding: 18 }}>
      <div style={{ marginBottom: 12 }}>
        <IllustratedHeading title={title} illustration={illustration} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {options.map((option) => {
          const checked = selected.includes(option.id);
          return (
            <label
              key={option.id}
              style={{
                display: "flex",
                gap: 7,
                alignItems: "center",
                border: "1px solid var(--color-border)",
                borderRadius: 999,
                padding: "8px 11px",
                background: checked ? "var(--color-accent-soft)" : "var(--color-surface)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  onChange(
                    checked ? selected.filter((id) => id !== option.id) : [...selected, option.id]
                  )
                }
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </section>
  );
}

function TextAreaField({
  label,
  illustration,
  value,
  onChange,
}: {
  label: string;
  illustration: ToddlerRoutineIllustrationKind;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={fieldLabelStyle}>
      <span style={illustratedTextAreaHeadingStyle}>
        <span>{label}</span>
        <ToddlerRoutineIllustration kind={illustration} small />
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        style={{
          border: "1px solid var(--color-border)",
          borderRadius: 9,
          padding: 10,
          font: "inherit",
          resize: "vertical",
          background: "var(--color-surface)",
          color: "var(--color-ink)",
        }}
      />
    </label>
  );
}

function IllustratedHeading({
  title,
  illustration,
}: {
  title: string;
  illustration: ToddlerRoutineIllustrationKind;
}) {
  return (
    <div style={illustratedSectionHeadingStyle}>
      <ToddlerRoutineIllustration kind={illustration} />
      <h2 style={sectionTitle}>{title}</h2>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  minHeight: 38,
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: "0 10px",
  background: "var(--color-surface)",
  color: "var(--color-ink)",
  fontSize: 14,
};
const fieldLabelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  fontWeight: 600,
  color: "var(--color-ink-secondary)",
};
const sectionTitle: React.CSSProperties = { margin: 0, fontSize: 17, color: "var(--color-ink)" };
const mutedStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: "var(--color-ink-muted)",
};
const threeColumnStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};
const illustratedFieldStyle: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  padding: "10px 12px 12px",
  background: "color-mix(in srgb, var(--color-surface) 88%, var(--color-clay-soft))",
};
const illustratedFieldHeadingStyle: React.CSSProperties = {
  minHeight: 68,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  color: "var(--color-ink)",
  fontSize: 14,
};
const illustratedSectionHeadingStyle: React.CSSProperties = {
  minHeight: 78,
  display: "flex",
  alignItems: "center",
  gap: 10,
};
const illustratedTextAreaHeadingStyle: React.CSSProperties = {
  minHeight: 66,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  color: "var(--color-ink)",
  fontSize: 15,
};
