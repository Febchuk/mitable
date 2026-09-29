"use client";

import * as React from "react";
import { PageHeader } from "@/components/montessori/page-header";
import { ToastBus } from "@/components/montessori/primitives";

type SenGroup = {
  id: string;
  name: string;
  classroomId: string;
  classroomName: string;
  memberIds: string[];
  students: Array<{ id: string; name: string }>;
};

type SenSetup = {
  classrooms: Array<{ id: string; name: string }>;
  groups: SenGroup[];
  error?: string;
};

export default function AdminSenPage() {
  const [data, setData] = React.useState<SenSetup | null>(null);
  const [selectedGroupId, setSelectedGroupId] = React.useState<string | null>(null);
  const [classroomId, setClassroomId] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [busyStudentId, setBusyStudentId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const response = await fetch("/api/admin/sen-groups", {
      credentials: "include",
      cache: "no-store",
    });
    const next = (await response.json()) as SenSetup;
    if (!response.ok) throw new Error(next.error ?? "Couldn't load SEN setup");
    setData(next);
    setSelectedGroupId((current) => current ?? next.groups[0]?.id ?? null);
    setClassroomId((current) => current || next.classrooms[0]?.id || "");
  }, []);

  React.useEffect(() => {
    void load().catch((error) => ToastBus.push({ message: error.message }));
  }, [load]);

  const selectedGroup = data?.groups.find((group) => group.id === selectedGroupId) ?? null;
  const classroomsWithoutGroups = (data?.classrooms ?? []).filter(
    (classroom) => !data?.groups.some((group) => group.classroomId === classroom.id)
  );

  const createGroup = async () => {
    if (!classroomId) return;
    const classroom = data?.classrooms.find((room) => room.id === classroomId);
    if (!classroom) return;
    setCreating(true);
    try {
      const response = await fetch("/api/admin/sen-groups", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_group",
          classroomId,
          name: `SEN — ${classroom.name}`,
        }),
      });
      const result = (await response.json()) as { ok?: boolean; id?: string; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Couldn't create SEN group");
      await load();
      setSelectedGroupId(result.id ?? null);
      ToastBus.push({ message: "SEN group created" });
    } catch (error) {
      ToastBus.push({
        message: error instanceof Error ? error.message : "Couldn't create SEN group",
      });
    } finally {
      setCreating(false);
    }
  };

  const setMember = async (studentId: string, active: boolean) => {
    if (!selectedGroup) return;
    setBusyStudentId(studentId);
    try {
      const response = await fetch("/api/admin/sen-groups", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_member",
          groupId: selectedGroup.id,
          studentId,
          active,
        }),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok)
        throw new Error(result.error ?? "Couldn't update SEN learners");
      await load();
    } catch (error) {
      ToastBus.push({
        message: error instanceof Error ? error.message : "Couldn't update SEN learners",
      });
    } finally {
      setBusyStudentId(null);
    }
  };

  return (
    <div style={{ minHeight: "100%", background: "var(--color-canvas)" }}>
      <PageHeader
        overline="Separate daily record"
        title="SEN reporting"
        subtitle="Choose which children receive the SEN daily report. Their normal classroom and normal progress remain unchanged."
      />
      <div
        style={{
          padding: "0 16px 36px",
          maxWidth: 980,
          margin: "0 auto",
          display: "grid",
          gap: 18,
        }}
      >
        <section style={cardStyle}>
          <h2 style={headingStyle}>Add SEN reporting to a classroom</h2>
          <p style={mutedStyle}>
            This creates a separate SEN report option; it does not create another classroom or move
            any children.
          </p>
          {classroomsWithoutGroups.length === 0 ? (
            <p style={mutedStyle}>Every active classroom already has an SEN report group.</p>
          ) : (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
              <select
                value={classroomId}
                onChange={(event) => setClassroomId(event.target.value)}
                style={inputStyle}
              >
                {classroomsWithoutGroups.map((classroom) => (
                  <option key={classroom.id} value={classroom.id}>
                    {classroom.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="tap"
                disabled={creating}
                onClick={() => void createGroup()}
                style={primaryButtonStyle}
              >
                {creating ? "Creating…" : "Create SEN group"}
              </button>
            </div>
          )}
        </section>

        {!data && <p style={mutedStyle}>Loading SEN setup…</p>}
        {data && data.groups.length === 0 && (
          <section style={cardStyle}>No SEN groups yet.</section>
        )}
        {data && data.groups.length > 0 && (
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(180px, 240px) minmax(0, 1fr)",
              gap: 18,
            }}
          >
            <aside style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
              {data.groups.map((group) => {
                const active = selectedGroup?.id === group.id;
                return (
                  <button
                    key={group.id}
                    type="button"
                    className="tap"
                    onClick={() => setSelectedGroupId(group.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "13px 14px",
                      border: 0,
                      borderBottom: "1px solid var(--color-border)",
                      background: active ? "var(--color-ink)" : "var(--color-surface)",
                      color: active ? "var(--color-surface)" : "var(--color-ink)",
                      font: "inherit",
                    }}
                  >
                    <strong style={{ display: "block", fontSize: 13 }}>{group.name}</strong>
                    <span style={{ display: "block", fontSize: 12, opacity: 0.72, marginTop: 3 }}>
                      {group.classroomName}
                    </span>
                  </button>
                );
              })}
            </aside>
            {selectedGroup && (
              <div style={cardStyle}>
                <h2 style={headingStyle}>{selectedGroup.name}</h2>
                <p style={mutedStyle}>Turn on only the children who need this daily SEN report.</p>
                <div style={{ display: "grid", gap: 4, marginTop: 16 }}>
                  {selectedGroup.students.map((student) => {
                    const checked = selectedGroup.memberIds.includes(student.id);
                    return (
                      <label
                        key={student.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          minHeight: 40,
                          padding: "6px 8px",
                          borderRadius: 8,
                          background: checked ? "var(--color-sage-soft)" : "transparent",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={busyStudentId === student.id}
                          onChange={(event) => void setMember(student.id, event.target.checked)}
                        />
                        <span>{student.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  padding: 18,
  border: "1px solid var(--color-border)",
  borderRadius: 14,
  background: "var(--color-surface)",
};
const headingStyle: React.CSSProperties = { margin: 0, fontSize: 18 };
const mutedStyle: React.CSSProperties = {
  margin: "7px 0 0",
  color: "var(--color-ink-secondary)",
  fontSize: 13,
  lineHeight: 1.45,
};
const inputStyle: React.CSSProperties = {
  minHeight: 40,
  border: "1px solid var(--color-border)",
  borderRadius: 9,
  background: "var(--color-surface)",
  color: "var(--color-ink)",
  padding: "0 10px",
  font: "inherit",
};
const primaryButtonStyle: React.CSSProperties = {
  minHeight: 40,
  border: 0,
  borderRadius: 9,
  padding: "0 14px",
  background: "var(--color-ink)",
  color: "var(--color-surface)",
  font: "inherit",
  fontWeight: 600,
};
