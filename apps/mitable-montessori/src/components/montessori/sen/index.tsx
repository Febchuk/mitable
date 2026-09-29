"use client";

import * as React from "react";
import { PageHeader } from "@/components/montessori/page-header";
import { ToastBus } from "@/components/montessori/primitives";
import { useMontessori } from "@/components/montessori/store";

type SenMetric = {
  id: string;
  section: "skill" | "maladaptive_behavior";
  metric_key: string;
  label: string;
  sort_order: number;
  scale_type: "performance" | "frequency";
  score_labels: string[];
};

type SenStudent = {
  id: string;
  name: string;
  report: {
    id: string;
    remarks: string;
    scores: Array<{ metricId: string; score: number }>;
  } | null;
};

type SenResponse = {
  classroom: { id: string; name: string };
  date: string;
  group: { id: string; name: string } | null;
  metrics: SenMetric[];
  students: SenStudent[];
  error?: string;
};

function localDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (kind: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === kind)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function sectionTitle(section: SenMetric["section"]) {
  return section === "skill" ? "Skills" : "Maladaptive behaviours";
}

export function SenReportsFeature() {
  const { classroomProgress, classrooms, selectedClassroomId, selectClassroom, classroomBusy } =
    useMontessori();
  const [date, setDate] = React.useState(localDate);
  const [data, setData] = React.useState<SenResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [selectedStudentId, setSelectedStudentId] = React.useState<string | null>(null);
  const [scores, setScores] = React.useState<Record<string, number>>({});
  const [remarks, setRemarks] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!selectedClassroomId) return;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/v1/sen-reports?classroomId=${encodeURIComponent(selectedClassroomId)}&date=${encodeURIComponent(date)}`,
        { credentials: "include", cache: "no-store" }
      );
      const next = (await response.json()) as SenResponse;
      if (!response.ok) throw new Error(next.error ?? "Couldn't load SEN reports");
      setData(next);
    } catch (error) {
      setData(null);
      ToastBus.push({
        message: error instanceof Error ? error.message : "Couldn't load SEN reports",
      });
    } finally {
      setLoading(false);
    }
  }, [date, selectedClassroomId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!data) return;
    setSelectedStudentId((current) =>
      current && data.students.some((student) => student.id === current)
        ? current
        : (data.students[0]?.id ?? null)
    );
  }, [data]);

  const selectedStudent =
    data?.students.find((student) => student.id === selectedStudentId) ?? null;

  React.useEffect(() => {
    const initialScores: Record<string, number> = {};
    selectedStudent?.report?.scores.forEach((score) => {
      initialScores[score.metricId] = score.score;
    });
    setScores(initialScores);
    setRemarks(selectedStudent?.report?.remarks ?? "");
  }, [selectedStudentId, selectedStudent?.report?.id, data?.date]);

  const groups = React.useMemo(() => {
    const bySection = new Map<SenMetric["section"], SenMetric[]>();
    for (const metric of data?.metrics ?? []) {
      bySection.set(metric.section, [...(bySection.get(metric.section) ?? []), metric]);
    }
    return [...bySection.entries()];
  }, [data?.metrics]);

  const save = async () => {
    if (!data?.group || !selectedStudent || !selectedClassroomId) return;
    if (Object.keys(scores).length !== data.metrics.length) {
      ToastBus.push({ message: "Choose a score for every item first" });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/v1/sen-reports", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classroomId: selectedClassroomId,
          groupId: data.group.id,
          studentId: selectedStudent.id,
          reportDate: date,
          remarks,
          scores: data.metrics.map((metric) => ({ metricId: metric.id, score: scores[metric.id] })),
        }),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Couldn't save SEN report");
      ToastBus.push({ message: "SEN report saved" });
      await load();
    } catch (error) {
      ToastBus.push({
        message: error instanceof Error ? error.message : "Couldn't save SEN report",
      });
    } finally {
      setSaving(false);
    }
  };

  const classroomName = classroomProgress?.classroomName ?? "Classroom";

  return (
    <div style={{ minHeight: "100%", background: "var(--color-canvas)" }}>
      <PageHeader
        overline="Separate daily record"
        title="SEN reports"
        subtitle={
          data?.group
            ? `${data.group.name} · kept separate from class progress.`
            : "Daily SEN reporting."
        }
        actions={
          <label
            style={{ display: "grid", gap: 5, fontSize: 12, color: "var(--color-ink-secondary)" }}
          >
            Report date
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              style={inputStyle}
            />
          </label>
        }
      />

      <div style={{ padding: "0 16px 36px", maxWidth: 1160, margin: "0 auto" }}>
        {classrooms.length > 1 && (
          <label style={{ display: "grid", gap: 6, maxWidth: 300, marginBottom: 18 }}>
            <span className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
              Classroom
            </span>
            <select
              value={selectedClassroomId ?? ""}
              disabled={classroomBusy}
              onChange={(event) => void selectClassroom(event.target.value)}
              style={inputStyle}
            >
              {classrooms.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {loading && <p style={mutedStyle}>Loading SEN reports…</p>}

        {!loading && data && !data.group && (
          <EmptyState
            title={`SEN reporting is not set up for ${classroomName}.`}
            body="This class does not have an SEN report group yet. Its ordinary class progress remains unchanged."
          />
        )}

        {!loading && data?.group && data.students.length === 0 && (
          <EmptyState
            title="No SEN learners have been added yet."
            body="An administrator needs to add the children who require daily SEN reports to this group before a teacher can start marking."
          />
        )}

        {!loading && data?.group && selectedStudent && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(190px, 260px) minmax(0, 1fr)",
              gap: 18,
            }}
          >
            <aside
              style={{
                alignSelf: "start",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: 14,
                overflow: "hidden",
              }}
            >
              <div
                className="label-cap"
                style={{ padding: "13px 14px", color: "var(--color-ink-muted)" }}
              >
                SEN learners
              </div>
              {data.students.map((student) => {
                const active = student.id === selectedStudent.id;
                return (
                  <button
                    key={student.id}
                    type="button"
                    className="tap"
                    onClick={() => setSelectedStudentId(student.id)}
                    style={{
                      display: "flex",
                      width: "100%",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      padding: "11px 14px",
                      borderTop: "1px solid var(--color-border)",
                      background: active ? "var(--color-ink)" : "transparent",
                      color: active ? "var(--color-surface)" : "var(--color-ink)",
                      textAlign: "left",
                      font: "inherit",
                      fontSize: 14,
                    }}
                  >
                    <span>{student.name}</span>
                    {student.report && <span style={{ fontSize: 11, opacity: 0.75 }}>Saved</span>}
                  </button>
                );
              })}
            </aside>

            <main style={{ display: "grid", gap: 18, minWidth: 0 }}>
              <section
                style={{
                  padding: 16,
                  border: "1px solid var(--color-border)",
                  borderRadius: 14,
                  background: "var(--color-surface)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div>
                    <div className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
                      Daily SEN report
                    </div>
                    <h2 style={{ margin: "5px 0 0", fontSize: 22 }}>{selectedStudent.name}</h2>
                  </div>
                  <span style={{ color: "var(--color-ink-secondary)", fontSize: 13 }}>{date}</span>
                </div>
              </section>

              {groups.map(([section, metrics]) => (
                <section
                  key={section}
                  style={{
                    border: "1px solid var(--color-border)",
                    borderRadius: 14,
                    overflow: "hidden",
                    background: "var(--color-surface)",
                  }}
                >
                  <div
                    style={{ padding: "14px 16px", borderBottom: "1px solid var(--color-border)" }}
                  >
                    <h3 style={{ margin: 0, fontSize: 16 }}>{sectionTitle(section)}</h3>
                    <p style={{ ...mutedStyle, margin: "4px 0 0" }}>
                      {section === "skill"
                        ? "1 = None · 2 = Minimum · 3 = Satisfactory · 4 = Good · 5 = Excellent"
                        : "1 = Continuous · 2 = Frequent · 3 = Occasional · 4 = Limited · 5 = None"}
                    </p>
                  </div>
                  <div>
                    {metrics.map((metric) => (
                      <div
                        key={metric.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(130px, 1fr) repeat(5, minmax(36px, 56px))",
                          gap: 6,
                          alignItems: "center",
                          padding: "11px 16px",
                          borderTop: "1px solid var(--color-border)",
                        }}
                      >
                        <span style={{ fontSize: 14, fontWeight: 500 }}>{metric.label}</span>
                        {[1, 2, 3, 4, 5].map((score) => {
                          const active = scores[metric.id] === score;
                          return (
                            <button
                              key={score}
                              type="button"
                              className="tap"
                              title={`${score}: ${metric.score_labels[score - 1] ?? ""}`}
                              aria-label={`${metric.label}: ${score}, ${metric.score_labels[score - 1] ?? ""}`}
                              onClick={() =>
                                setScores((current) => ({ ...current, [metric.id]: score }))
                              }
                              style={{
                                height: 34,
                                borderRadius: 8,
                                border: `1px solid ${active ? "var(--color-ink)" : "var(--color-border)"}`,
                                background: active ? "var(--color-ink)" : "var(--color-canvas)",
                                color: active
                                  ? "var(--color-surface)"
                                  : "var(--color-ink-secondary)",
                                cursor: "pointer",
                                font: "inherit",
                                fontWeight: active ? 700 : 500,
                              }}
                            >
                              {score}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </section>
              ))}

              <label style={{ display: "grid", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Remarks</span>
                <textarea
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                  placeholder="Add any observations for this day…"
                  rows={5}
                  style={{ ...inputStyle, padding: 12, resize: "vertical" }}
                />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="tap"
                  disabled={saving}
                  onClick={() => void save()}
                  style={{
                    minHeight: 42,
                    border: 0,
                    borderRadius: 10,
                    padding: "0 18px",
                    background: "var(--color-ink)",
                    color: "var(--color-surface)",
                    cursor: saving ? "wait" : "pointer",
                    font: "inherit",
                    fontWeight: 600,
                    opacity: saving ? 0.65 : 1,
                  }}
                >
                  {saving ? "Saving…" : "Save SEN report"}
                </button>
              </div>
            </main>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <section
      style={{
        maxWidth: 620,
        padding: 22,
        border: "1px solid var(--color-border)",
        borderRadius: 14,
        background: "var(--color-surface)",
      }}
    >
      <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
      <p style={{ ...mutedStyle, margin: "8px 0 0" }}>{body}</p>
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  minHeight: 40,
  border: "1px solid var(--color-border)",
  borderRadius: 9,
  background: "var(--color-surface)",
  color: "var(--color-ink)",
  padding: "0 10px",
  font: "inherit",
};

const mutedStyle: React.CSSProperties = {
  color: "var(--color-ink-secondary)",
  fontSize: 13,
  lineHeight: 1.45,
};
