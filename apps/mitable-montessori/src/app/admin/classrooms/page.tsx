"use client";

import * as React from "react";
import { z } from "zod";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Download,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { initialsFor, type Tone } from "@/components/montessori/data";
import { PageHeader, cardStyle } from "@/components/montessori/page-header";
import { Avatar } from "@/components/montessori/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  STUDENT_IMPORT_TEMPLATE,
  analyzeImportDraft,
  ageLabelFromBirthDate,
  buildImportDrafts,
  buildStudentImportPlan,
  detectImportMapping,
  parseImportText,
  type ClassroomOption,
  type DraftAnalysis,
  type ImportField,
  type ImportIssue,
  type ImportMapping,
  type RawImportData,
  type StudentImportDraft,
  type StudentImportPlan,
} from "@/lib/admin/student-import";
import {
  PROGRAM_LABEL,
  PROGRAM_ORDER,
  type ProgressProgram,
} from "@/lib/queries/progress-programs";

type AdminChild = {
  id: string;
  name: string;
  age: string;
  birthDate?: string;
  enrolled: string;
  recent: string;
  tone: Tone;
  classroomId: string;
  guardians: Array<{ name: string; email: string; relationship: string }>;
};

type AdminClassroom = ClassroomOption & {
  level?: string;
  curriculumName?: string | null;
  mainTeacherId?: string;
  programTypes: ProgressProgram[];
};

type ApiTeacher = { id: string; name: string };

type ApiClassroom = {
  id: string;
  name: string;
  code: string | null;
  curriculumName: string | null;
  leadTeacherId: string | null;
  programTypes: ProgressProgram[];
};

type ApiRosterStudent = {
  id: string;
  classroomId: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  birthDate: string | null;
  enrolledStart: string;
  guardians: Array<{
    relationship: string | null;
    firstName: string;
    lastName: string;
    email: string | null;
  }>;
};

type OverviewResponse = {
  classrooms: ApiClassroom[];
  teachers: ApiTeacher[];
  roster: ApiRosterStudent[];
};

const LEVEL_OPTIONS = ["Toddler", "Primary", "Lower Elementary", "Upper Elementary"];

const TONE_CYCLE: Tone[] = ["clay", "sage", "butter", "blue", "terracotta"];

function formatEnrolled(isoDate: string): string {
  try {
    const d = new Date(`${isoDate}T12:00:00`);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return isoDate;
  }
}

function guardianRelationshipLabel(r: string | null): string {
  switch (r) {
    case "mother":
      return "Mother";
    case "father":
      return "Father";
    case "other":
      return "Family";
    default:
      return "Guardian";
  }
}

function mapGuardianRelationship(raw: string): "mother" | "father" | "guardian" | "other" {
  const x = raw.trim().toLowerCase();
  if (x.includes("mother") || x === "mom") return "mother";
  if (x.includes("father") || x === "dad") return "father";
  if (x.includes("other")) return "other";
  return "guardian";
}

function splitPersonName(full: string): { first_name: string; last_name: string } {
  const t = full.trim();
  const space = t.indexOf(" ");
  if (space === -1) return { first_name: t || "Unknown", last_name: "" };
  return { first_name: t.slice(0, space).trim(), last_name: t.slice(space + 1).trim() };
}

function rosterToAdminChildren(roster: ApiRosterStudent[]): AdminChild[] {
  return roster.map((r, index) => ({
    id: r.id,
    name: `${r.firstName} ${r.lastName}`.trim(),
    age: r.birthDate ? ageLabelFromBirthDate(r.birthDate) : "—",
    birthDate: r.birthDate ?? undefined,
    enrolled: formatEnrolled(r.enrolledStart),
    recent: "No observations yet",
    tone: TONE_CYCLE[index % TONE_CYCLE.length],
    classroomId: r.classroomId,
    guardians: r.guardians.map((g) => ({
      name: `${g.firstName} ${g.lastName}`.trim(),
      email: g.email ?? "",
      relationship: guardianRelationshipLabel(g.relationship),
    })),
  }));
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

const FIELD_LABELS: Record<ImportField, string> = {
  first_name: "First name",
  last_name: "Last name",
  full_name: "Full name",
  birth_date: "Birthday",
  classroom: "Classroom",
  guardian_name: "Guardian name",
  guardian_email: "Guardian email",
  guardian_phone: "Guardian phone",
  guardian_relationship: "Guardian relation",
  ignore: "Ignore",
};

const FIELD_OPTIONS: ImportField[] = [
  "first_name",
  "last_name",
  "full_name",
  "birth_date",
  "classroom",
  "guardian_name",
  "guardian_email",
  "guardian_phone",
  "guardian_relationship",
  "ignore",
];

export default function AdminClassroomsPage() {
  const [classrooms, setClassrooms] = React.useState<AdminClassroom[]>([]);
  const [teacherPool, setTeacherPool] = React.useState<ApiTeacher[]>([]);
  const [children, setChildren] = React.useState<AdminChild[]>([]);
  const [selectedClassroomId, setSelectedClassroomId] = React.useState<string | null>(null);
  const [loadState, setLoadState] = React.useState<"idle" | "loading" | "error">("loading");
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [mutationError, setMutationError] = React.useState<string | null>(null);
  const [pendingArchiveChild, setPendingArchiveChild] = React.useState<AdminChild | null>(null);
  const [archiveBusy, setArchiveBusy] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [createClassroomOpen, setCreateClassroomOpen] = React.useState(false);
  const [addChildOpen, setAddChildOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const reload = React.useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);
    try {
      const data = await apiJson<OverviewResponse>("/api/admin/classrooms");
      const mappedClassrooms: AdminClassroom[] = data.classrooms.map((c) => ({
        id: c.id,
        name: c.name,
        level: c.code ?? "",
        curriculumName: c.curriculumName,
        mainTeacherId: c.leadTeacherId ?? undefined,
        programTypes:
          Array.isArray(c.programTypes) && c.programTypes.length > 0
            ? c.programTypes
            : ["montessori"],
      }));
      setClassrooms(mappedClassrooms);
      setTeacherPool(data.teachers);
      setChildren(rosterToAdminChildren(data.roster));
      setSelectedClassroomId((prev) => {
        if (mappedClassrooms.length === 0) return null;
        if (prev && mappedClassrooms.some((x) => x.id === prev)) return prev;
        return mappedClassrooms[0].id;
      });
      setLoadState("idle");
    } catch (e) {
      setLoadState("error");
      setLoadError(e instanceof Error ? e.message : "Failed to load classrooms");
    }
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const selectedClassroom = selectedClassroomId
    ? (classrooms.find((c) => c.id === selectedClassroomId) ?? null)
    : null;

  const selectedChildren = React.useMemo(() => {
    if (!selectedClassroom) return [];
    return children
      .filter((child) => child.classroomId === selectedClassroom.id)
      .filter((child) => child.name.toLowerCase().includes(search.trim().toLowerCase()));
  }, [children, selectedClassroom, search]);

  const counts = React.useMemo(() => {
    const map = new Map<string, number>();
    children.forEach((child) => map.set(child.classroomId, (map.get(child.classroomId) ?? 0) + 1));
    return map;
  }, [children]);

  const totalInClassroom = selectedClassroom ? (counts.get(selectedClassroom.id) ?? 0) : 0;

  const existingStudents = React.useMemo(
    () =>
      children.map((child) => ({
        id: child.id,
        name: child.name,
        birthDate: child.birthDate,
        classroomId: child.classroomId,
      })),
    [children]
  );

  const applyImportPlan = async (plan: StudentImportPlan) => {
    setMutationError(null);
    try {
      for (const s of plan.newStudents) {
        const created = await apiJson<{ ok: boolean; id: string }>("/api/admin/students", {
          method: "POST",
          body: JSON.stringify({
            first_name: s.firstName,
            last_name: s.lastName,
            ...(s.birthDate ? { birth_date: s.birthDate } : {}),
            classroom_id: s.classroomId,
          }),
        });
        const studentId = created.id;
        for (const g of s.guardians) {
          const email = (g.email ?? "").trim();
          const name = (g.name ?? "").trim();
          if (!email && !name) continue;
          const gn = name ? splitPersonName(name) : { first_name: "", last_name: "" };
          const guardianRow = await apiJson<{ ok: boolean; id: string }>("/api/admin/guardians", {
            method: "POST",
            body: JSON.stringify({
              first_name: gn.first_name.trim() || undefined,
              last_name: gn.last_name.trim() || undefined,
              email: email || undefined,
              phone: (g.phone ?? "").trim() || undefined,
              preferred_contact_method: "either",
            }),
          });
          await apiJson("/api/admin/student-guardians", {
            method: "POST",
            body: JSON.stringify({
              student_id: studentId,
              guardian_id: guardianRow.id,
              relationship: mapGuardianRelationship(g.relationship || "guardian"),
              is_primary_contact: false,
              receives_reports: true,
            }),
          });
        }
      }
      for (const item of plan.guardiansForExisting) {
        const email = (item.guardian.email ?? "").trim();
        const name = (item.guardian.name ?? "").trim();
        const gn = name ? splitPersonName(name) : { first_name: "", last_name: "" };
        const guardianRow = await apiJson<{ ok: boolean; id: string }>("/api/admin/guardians", {
          method: "POST",
          body: JSON.stringify({
            first_name: gn.first_name.trim() || undefined,
            last_name: gn.last_name.trim() || undefined,
            email: email || undefined,
            phone: (item.guardian.phone ?? "").trim() || undefined,
            preferred_contact_method: "either",
          }),
        });
        await apiJson("/api/admin/student-guardians", {
          method: "POST",
          body: JSON.stringify({
            student_id: item.studentId,
            guardian_id: guardianRow.id,
            relationship: mapGuardianRelationship(item.guardian.relationship || "guardian"),
            is_primary_contact: false,
            receives_reports: true,
          }),
        });
      }
      await reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Import failed";
      setMutationError(msg);
      throw e;
    }
  };

  const createClassroom = async (input: {
    name: string;
    level: string;
    mainTeacherId: string;
    programTypes: ProgressProgram[];
  }) => {
    setMutationError(null);
    try {
      const code = input.level.length <= 20 ? input.level : input.level.slice(0, 20);
      const created = await apiJson<{ ok: boolean; id: string }>("/api/admin/classrooms", {
        method: "POST",
        body: JSON.stringify({
          name: input.name.trim(),
          code: code || undefined,
          program_types: input.programTypes,
        }),
      });
      const id = created.id;
      if (input.mainTeacherId) {
        await apiJson("/api/admin/classroom-teachers", {
          method: "POST",
          body: JSON.stringify({
            classroom_id: id,
            teacher_user_id: input.mainTeacherId,
            classroom_role: "lead",
            start_date: new Date().toISOString().slice(0, 10),
          }),
        });
      }
      await reload();
      setSelectedClassroomId(id);
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : "Could not create classroom");
    }
  };

  const setClassroomPrograms = async (
    classroomId: string,
    programTypes: ProgressProgram[]
  ): Promise<boolean> => {
    setMutationError(null);
    try {
      await apiJson("/api/admin/classrooms", {
        method: "PATCH",
        body: JSON.stringify({ classroom_id: classroomId, program_types: programTypes }),
      });
      await reload();
      return true;
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : "Could not update programs");
      return false;
    }
  };

  const confirmArchiveChild = React.useCallback(async () => {
    if (!pendingArchiveChild) return;
    setArchiveBusy(true);
    setMutationError(null);
    try {
      await apiJson<{ ok: boolean }>(`/api/admin/students/${pendingArchiveChild.id}`, {
        method: "DELETE",
      });
      setPendingArchiveChild(null);
      await reload();
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : "Could not remove child");
    } finally {
      setArchiveBusy(false);
    }
  }, [pendingArchiveChild, reload]);

  const addChildManually = async (input: {
    firstName: string;
    lastName: string;
    birthDate?: string;
    guardianFirstName?: string;
    guardianLastName?: string;
    guardianEmail?: string;
    guardianPhone?: string;
  }) => {
    if (!selectedClassroomId) return;
    setMutationError(null);
    try {
      const bd = input.birthDate?.trim();
      const created = await apiJson<{ ok: boolean; id: string }>("/api/admin/students", {
        method: "POST",
        body: JSON.stringify({
          first_name: input.firstName.trim(),
          last_name: input.lastName.trim(),
          ...(bd ? { birth_date: bd } : {}),
          classroom_id: selectedClassroomId,
        }),
      });
      const gfn = input.guardianFirstName?.trim();
      const gln = input.guardianLastName?.trim();
      const gem = input.guardianEmail?.trim();
      const gphone = input.guardianPhone?.trim();
      const emailOk = gem ? z.string().email().safeParse(gem).success : false;
      if (emailOk || (gfn && gln)) {
        const guardianRow = await apiJson<{ ok: boolean; id: string }>("/api/admin/guardians", {
          method: "POST",
          body: JSON.stringify({
            first_name: gfn || undefined,
            last_name: gln || undefined,
            email: gem || undefined,
            phone: gphone || undefined,
            preferred_contact_method: "either",
          }),
        });
        await apiJson("/api/admin/student-guardians", {
          method: "POST",
          body: JSON.stringify({
            student_id: created.id,
            guardian_id: guardianRow.id,
            relationship: "guardian",
            is_primary_contact: true,
            receives_reports: true,
          }),
        });
      }
      await reload();
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : "Could not add child");
    }
  };

  if (loadState === "loading") {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "var(--color-ink-muted)" }}>
        Loading classrooms…
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div style={{ padding: 48 }}>
        <p style={{ color: "var(--color-status-error, #b42318)" }}>{loadError}</p>
        <Button type="button" variant="secondary" onClick={() => void reload()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Classrooms"
        subtitle="View and modify classrooms."
        actions={
          <Button variant="default" onClick={() => setCreateClassroomOpen(true)}>
            <Plus size={16} strokeWidth={1.7} /> Add classroom
          </Button>
        }
      />

      {mutationError ? (
        <div
          style={{
            margin: "0 24px",
            padding: "10px 14px",
            borderRadius: 10,
            background: "rgba(180, 35, 24, 0.08)",
            color: "var(--color-status-error, #b42318)",
            fontSize: 13,
          }}
        >
          {mutationError}
        </div>
      ) : null}

      <div
        style={{
          padding: "20px 24px 64px",
          display: "grid",
          gridTemplateColumns: "minmax(240px, 320px) minmax(0, 1fr)",
          gap: 18,
          alignItems: "start",
        }}
      >
        <aside style={cardStyle}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--color-border)" }}>
            <div className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
              Classrooms
            </div>
          </div>
          {classrooms.length === 0 ? (
            <div
              style={{ padding: "18px 16px", fontSize: 13, color: "var(--color-ink-secondary)" }}
            >
              No classrooms yet. Use &quot;Add classroom&quot; to create one.
            </div>
          ) : (
            classrooms.map((classroom, index) => {
              const active = classroom.id === selectedClassroomId;
              return (
                <button
                  key={classroom.id}
                  type="button"
                  className="tap"
                  onClick={() => setSelectedClassroomId(classroom.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 16px",
                    border: 0,
                    borderTop: index ? "1px solid var(--color-border)" : 0,
                    background: active ? "var(--color-terracotta-soft)" : "transparent",
                    textAlign: "left",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-ink)" }}>
                      {classroom.name}
                    </div>
                    <div
                      style={{ fontSize: 12, color: "var(--color-ink-secondary)", marginTop: 2 }}
                    >
                      {counts.get(classroom.id) ?? 0} children
                    </div>
                    {classroom.programTypes.length > 0 && (
                      <div
                        style={{
                          marginTop: 4,
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 4,
                        }}
                      >
                        {classroom.programTypes.map((p) => (
                          <span
                            key={p}
                            style={{
                              fontSize: 10,
                              fontWeight: 500,
                              padding: "1px 6px",
                              borderRadius: 999,
                              background: "var(--color-surface)",
                              border: "1px solid var(--color-border)",
                              color: "var(--color-ink-muted)",
                              letterSpacing: "0.02em",
                            }}
                          >
                            {PROGRAM_LABEL[p]}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <ChevronRight size={15} strokeWidth={1.5} />
                </button>
              );
            })
          )}
        </aside>

        {selectedClassroom ? (
          <section style={cardStyle}>
            <div
              style={{
                padding: "16px 18px",
                borderBottom: "1px solid var(--color-border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--color-ink)" }}>
                  {selectedClassroom.name}
                </h2>
                <div style={{ fontSize: 12, color: "var(--color-ink-secondary)", marginTop: 2 }}>
                  {totalInClassroom} children
                  {selectedClassroom.curriculumName ? (
                    <span style={{ marginLeft: 8, color: "var(--color-ink-muted)" }}>
                      · {selectedClassroom.curriculumName}
                    </span>
                  ) : null}
                </div>
                <ProgramTypesEditor
                  value={selectedClassroom.programTypes}
                  onSave={(next) => setClassroomPrograms(selectedClassroom.id, next)}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Button variant="default" onClick={() => setImportOpen(true)}>
                  <Upload size={16} strokeWidth={1.7} /> Import children
                </Button>
                <Button variant="secondary" onClick={() => setAddChildOpen(true)}>
                  <Plus size={16} strokeWidth={1.7} /> Add child
                </Button>
                <div style={{ position: "relative", width: 220 }}>
                  <Search
                    size={15}
                    strokeWidth={1.5}
                    style={{
                      position: "absolute",
                      left: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--color-ink-muted)",
                    }}
                  />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search children"
                    style={{ paddingLeft: 32 }}
                  />
                </div>
              </div>
            </div>

            {totalInClassroom === 0 ? (
              <EmptyClassroomState
                onImport={() => setImportOpen(true)}
                onAddChild={() => setAddChildOpen(true)}
              />
            ) : (
              <>
                <div className="hidden lg:block">
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.6fr 0.6fr 0.9fr 1.4fr 40px",
                      padding: "12px 20px",
                      borderBottom: "1px solid var(--color-border)",
                    }}
                  >
                    {["Child", "Age", "Enrolled", "Latest observation", ""].map((header) => (
                      <div
                        key={header}
                        className="label-cap"
                        style={{ color: "var(--color-ink-muted)" }}
                      >
                        {header}
                      </div>
                    ))}
                  </div>
                  {selectedChildren.map((child) => (
                    <RosterRow
                      key={child.id}
                      child={child}
                      onRemove={() => setPendingArchiveChild(child)}
                    />
                  ))}
                </div>

                <div className="lg:hidden">
                  {selectedChildren.map((child, index) => (
                    <RosterMobileRow
                      key={child.id}
                      child={child}
                      index={index}
                      onRemove={() => setPendingArchiveChild(child)}
                    />
                  ))}
                </div>

                {selectedChildren.length === 0 && (
                  <div
                    style={{
                      padding: 28,
                      textAlign: "center",
                      fontSize: 13,
                      color: "var(--color-ink-muted)",
                    }}
                  >
                    No children match this search.
                  </div>
                )}
              </>
            )}
          </section>
        ) : (
          <section style={cardStyle}>
            <div
              style={{
                padding: 40,
                textAlign: "center",
                fontSize: 14,
                color: "var(--color-ink-secondary)",
              }}
            >
              Add a classroom to manage children.
            </div>
          </section>
        )}
      </div>

      <StudentImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        classrooms={classrooms}
        existingStudents={existingStudents}
        onImport={applyImportPlan}
      />

      <CreateClassroomDialog
        open={createClassroomOpen}
        onOpenChange={setCreateClassroomOpen}
        onCreate={createClassroom}
        teachers={teacherPool}
      />

      <AddChildDialog
        open={addChildOpen}
        onOpenChange={setAddChildOpen}
        classroomName={selectedClassroom?.name ?? "Classroom"}
        onAdd={addChildManually}
      />

      <Dialog
        open={!!pendingArchiveChild}
        onOpenChange={(open) => !open && setPendingArchiveChild(null)}
      >
        <DialogContent className="border-ink/10 bg-canvas">
          <DialogHeader>
            <DialogTitle>Remove this child from the roster?</DialogTitle>
            <DialogDescription>
              {pendingArchiveChild ? (
                <>
                  This removes{" "}
                  <span className="font-medium text-ink">{pendingArchiveChild.name}</span> from
                  class lists for teachers. The record stays in the database (soft archive) and can
                  be restored by support if needed.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-ink/15 bg-canvas px-3 py-1.5 text-sm font-medium text-ink hover:bg-canvas-muted"
              disabled={archiveBusy}
              onClick={() => setPendingArchiveChild(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-lg border px-3 py-1.5 text-sm font-medium"
              style={{
                borderColor: "rgba(232, 116, 116, 0.45)",
                color: "var(--status-error, #e87474)",
              }}
              disabled={archiveBusy}
              onClick={() => void confirmArchiveChild()}
            >
              {archiveBusy ? "Removing…" : "Remove from roster"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyClassroomState({
  onImport,
  onAddChild,
}: {
  onImport: () => void;
  onAddChild: () => void;
}) {
  return (
    <div
      style={{
        padding: "48px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 999,
          background: "var(--color-muted)",
          color: "var(--color-ink-muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Users size={26} strokeWidth={1.4} />
      </div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink)" }}>
          No children in this classroom yet
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--color-ink-secondary)",
            marginTop: 4,
            maxWidth: 360,
          }}
        >
          Import a roster from a spreadsheet, or add children one at a time.
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <Button variant="default" onClick={onImport}>
          <Upload size={16} strokeWidth={1.7} /> Import children
        </Button>
        <Button variant="secondary" onClick={onAddChild}>
          <Plus size={16} strokeWidth={1.7} /> Add child
        </Button>
      </div>
    </div>
  );
}

function CreateClassroomDialog({
  open,
  onOpenChange,
  onCreate,
  teachers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: {
    name: string;
    level: string;
    mainTeacherId: string;
    programTypes: ProgressProgram[];
  }) => void | Promise<void>;
  teachers: ApiTeacher[];
}) {
  const [name, setName] = React.useState("");
  const [level, setLevel] = React.useState(LEVEL_OPTIONS[0]);
  const [mainTeacherId, setMainTeacherId] = React.useState("");
  const [programTypes, setProgramTypes] = React.useState<ProgressProgram[]>(["montessori"]);

  React.useEffect(() => {
    if (!open) {
      setName("");
      setLevel(LEVEL_OPTIONS[0]);
      setMainTeacherId("");
      setProgramTypes(["montessori"]);
    }
  }, [open]);

  const canSubmit = name.trim().length > 0 && programTypes.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[460px] rounded-[22px] border border-border bg-surface p-0 shadow-2xl">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle className="text-xl">Add classroom</DialogTitle>
          <p className="text-sm text-ink-secondary">
            Give the classroom a name, level, and a main teacher.
          </p>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          <FieldLabel label="Classroom name">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Primary East"
              className="h-10 bg-canvas"
              autoFocus
            />
          </FieldLabel>

          <FieldLabel label="Level">
            <SelectInput
              value={level}
              onChange={setLevel}
              options={LEVEL_OPTIONS.map((option) => ({ value: option, label: option }))}
            />
          </FieldLabel>

          <FieldLabel label="Main teacher">
            <SelectInput
              value={mainTeacherId}
              onChange={setMainTeacherId}
              options={[
                {
                  value: "",
                  label: teachers.length ? "— Optional —" : "Add teachers under Staff first",
                },
                ...teachers.map((teacher) => ({ value: teacher.id, label: teacher.name })),
              ]}
            />
          </FieldLabel>

          <FieldLabel label="Programs (drives the Progress route for teachers)">
            <ProgramPicker value={programTypes} onChange={setProgramTypes} />
            <p className="mt-1 text-xs text-ink-muted">
              Pick at least one. A classroom with multiple programs surfaces a top switcher in
              Progress.
            </p>
          </FieldLabel>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) return;
              onCreate({ name, level, mainTeacherId, programTypes });
              onOpenChange(false);
            }}
          >
            Add classroom
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddChildDialog({
  open,
  onOpenChange,
  classroomName,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classroomName: string;
  onAdd: (input: {
    firstName: string;
    lastName: string;
    birthDate?: string;
    guardianFirstName?: string;
    guardianLastName?: string;
    guardianEmail?: string;
    guardianPhone?: string;
  }) => void | Promise<void>;
}) {
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [birthDate, setBirthDate] = React.useState("");
  const [guardianFirstName, setGuardianFirstName] = React.useState("");
  const [guardianLastName, setGuardianLastName] = React.useState("");
  const [guardianEmail, setGuardianEmail] = React.useState("");
  const [guardianPhone, setGuardianPhone] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      setFirstName("");
      setLastName("");
      setBirthDate("");
      setGuardianFirstName("");
      setGuardianLastName("");
      setGuardianEmail("");
      setGuardianPhone("");
    }
  }, [open]);

  const gf = guardianFirstName.trim();
  const gl = guardianLastName.trim();
  const ge = guardianEmail.trim();
  const gp = guardianPhone.trim();
  const emailOk = ge.length > 0 ? z.string().email().safeParse(ge).success : false;
  const oneNameOnly = Boolean(gf) !== Boolean(gl);
  const guardianPartial =
    oneNameOnly || (ge.length > 0 && !emailOk) || (Boolean(gp) && !emailOk && !(gf && gl));

  const canSubmit = firstName.trim().length > 0 && lastName.trim().length > 0 && !guardianPartial;

  // Calendar picker icon — push to far right and keep the date text left aligned
  // so the field doesn't look like the icon is floating in the middle.
  const dateInputClassName =
    "h-10 bg-canvas text-left [&::-webkit-calendar-picker-indicator]:ml-auto [&::-webkit-calendar-picker-indicator]:cursor-pointer";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px] rounded-[22px] border border-border bg-surface p-0 shadow-2xl">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle className="text-xl">Add child</DialogTitle>
          <p className="text-sm text-ink-secondary">Adding to {classroomName}.</p>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          <div className="grid gap-3 md:grid-cols-2">
            <FieldLabel label="First name">
              <Input
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                className="h-10 bg-canvas"
                autoFocus
              />
            </FieldLabel>
            <FieldLabel label="Last name">
              <Input
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                className="h-10 bg-canvas"
              />
            </FieldLabel>
          </div>

          <FieldLabel label="Birthday (optional)">
            <Input
              type="date"
              value={birthDate}
              onChange={(event) => setBirthDate(event.target.value)}
              className={dateInputClassName}
            />
          </FieldLabel>

          <div
            style={{
              borderTop: "1px solid var(--color-border)",
              paddingTop: 16,
            }}
          >
            <div className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
              Guardian (optional)
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <FieldLabel label="Guardian first name">
                <Input
                  value={guardianFirstName}
                  onChange={(event) => setGuardianFirstName(event.target.value)}
                  className="h-10 bg-canvas"
                />
              </FieldLabel>
              <FieldLabel label="Guardian last name">
                <Input
                  value={guardianLastName}
                  onChange={(event) => setGuardianLastName(event.target.value)}
                  className="h-10 bg-canvas"
                />
              </FieldLabel>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <FieldLabel label="Guardian email">
                <Input
                  type="email"
                  value={guardianEmail}
                  onChange={(event) => setGuardianEmail(event.target.value)}
                  className="h-10 bg-canvas"
                />
              </FieldLabel>
              <FieldLabel label="Guardian phone (optional)">
                <Input
                  type="tel"
                  value={guardianPhone}
                  onChange={(event) => setGuardianPhone(event.target.value)}
                  className="h-10 bg-canvas"
                />
              </FieldLabel>
            </div>
            {guardianPartial && (
              <p className="mt-2 text-xs text-terracotta">
                Use a valid email (names optional with email), or both first and last name, or leave
                guardian fields blank. Add a phone only together with a valid email or with both
                names.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) return;
              void onAdd({
                firstName,
                lastName,
                birthDate: birthDate.trim() || undefined,
                guardianFirstName: gf || undefined,
                guardianLastName: gl || undefined,
                guardianEmail: ge || undefined,
                guardianPhone: gp || undefined,
              });
              onOpenChange(false);
            }}
          >
            Add child
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProgramPicker({
  value,
  onChange,
}: {
  value: ProgressProgram[];
  onChange: (next: ProgressProgram[]) => void;
}) {
  const toggle = (p: ProgressProgram) => {
    if (value.includes(p)) {
      // Don't let the user clear the last one — at least one program is required.
      if (value.length === 1) return;
      onChange(value.filter((x) => x !== p));
    } else {
      onChange(PROGRAM_ORDER.filter((x) => x === p || value.includes(x)));
    }
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {PROGRAM_ORDER.map((p) => {
        const active = value.includes(p);
        return (
          <button
            key={p}
            type="button"
            onClick={() => toggle(p)}
            className="tap"
            aria-pressed={active}
            style={{
              padding: "7px 12px",
              borderRadius: 999,
              border: `1px solid ${active ? "var(--color-ink)" : "var(--color-border)"}`,
              background: active ? "var(--color-ink)" : "var(--color-canvas)",
              color: active ? "var(--color-surface)" : "var(--color-ink-secondary)",
              fontSize: 12.5,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "background 120ms ease, color 120ms ease, border-color 120ms ease",
            }}
          >
            {PROGRAM_LABEL[p]}
          </button>
        );
      })}
    </div>
  );
}

function ProgramTypesEditor({
  value,
  onSave,
}: {
  value: ProgressProgram[];
  onSave: (next: ProgressProgram[]) => Promise<boolean>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<ProgressProgram[]>(value);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  if (!editing) {
    return (
      <div
        style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}
      >
        {value.map((p) => (
          <span
            key={p}
            style={{
              fontSize: 11,
              fontWeight: 500,
              padding: "3px 8px",
              borderRadius: 999,
              background: "var(--color-canvas)",
              border: "1px solid var(--color-border)",
              color: "var(--color-ink-secondary)",
            }}
          >
            {PROGRAM_LABEL[p]}
          </span>
        ))}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="tap"
          style={{
            fontSize: 11,
            fontWeight: 500,
            padding: "2px 6px",
            background: "transparent",
            border: 0,
            color: "var(--color-ink-muted)",
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          Edit programs
        </button>
      </div>
    );
  }

  const dirty = draft.length !== value.length || draft.some((p, i) => p !== value[i]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
      <ProgramPicker value={draft} onChange={setDraft} />
      <Button
        type="button"
        size="sm"
        disabled={!dirty || busy}
        onClick={async () => {
          setBusy(true);
          const ok = await onSave(draft);
          setBusy(false);
          if (ok) setEditing(false);
        }}
      >
        {busy ? "Saving…" : "Save"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => {
          setDraft(value);
          setEditing(false);
        }}
      >
        Cancel
      </Button>
    </div>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <div className="label-cap mb-1" style={{ color: "var(--color-ink-muted)" }}>
        {label}
      </div>
      {children}
    </label>
  );
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full rounded-md border border-ink/15 bg-canvas px-2 text-sm text-ink"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function RosterRow({ child, onRemove }: { child: AdminChild; onRemove: () => void }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.6fr 0.6fr 0.9fr 1.4fr 40px",
        alignItems: "center",
        padding: "12px 20px",
        width: "100%",
        textAlign: "left",
        background: "transparent",
        border: 0,
        borderTop: "1px solid var(--color-border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Avatar initials={initialsFor(child.name)} tone={child.tone} size={34} />
        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--color-ink)" }}>{child.name}</div>
      </div>
      <div className="font-numeric" style={{ fontSize: 13, color: "var(--color-ink-secondary)" }}>
        {child.age || "-"}
      </div>
      <div style={{ fontSize: 13, color: "var(--color-ink-secondary)" }}>{child.enrolled}</div>
      <div style={{ fontSize: 13, color: "var(--color-ink-secondary)" }}>{child.recent}</div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          className="tap rounded-md p-2 text-ink-muted hover:bg-ink/5 hover:text-status-error"
          title="Remove child from roster"
          aria-label={`Remove ${child.name} from roster`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <Trash2 size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

function RosterMobileRow({
  child,
  index,
  onRemove,
}: {
  child: AdminChild;
  index: number;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        width: "100%",
        textAlign: "left",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        background: "transparent",
        border: 0,
        borderTop: index ? "1px solid var(--color-border)" : "0",
      }}
    >
      <Avatar initials={initialsFor(child.name)} tone={child.tone} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: "var(--color-ink)" }}>{child.name}</div>
        <div
          style={{
            fontSize: 12,
            color: "var(--color-ink-secondary)",
            marginTop: 2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {child.recent}
        </div>
      </div>
      <div className="font-numeric" style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
        {child.age}
      </div>
      <button
        type="button"
        className="tap shrink-0 rounded-md p-2 text-ink-muted hover:bg-ink/5 hover:text-status-error"
        title="Remove child from roster"
        aria-label={`Remove ${child.name} from roster`}
        onClick={() => onRemove()}
      >
        <Trash2 size={18} strokeWidth={1.5} />
      </button>
    </div>
  );
}

function StudentImportDialog({
  open,
  onOpenChange,
  classrooms,
  existingStudents,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classrooms: ClassroomOption[];
  existingStudents: Array<{ id: string; name: string; birthDate?: string; classroomId?: string }>;
  onImport: (plan: StudentImportPlan) => void | Promise<void>;
}) {
  const [rawData, setRawData] = React.useState<RawImportData | null>(null);
  const [mapping, setMapping] = React.useState<ImportMapping>({});
  const [drafts, setDrafts] = React.useState<StudentImportDraft[]>([]);
  const [pasteText, setPasteText] = React.useState("");
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [importBusy, setImportBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setRawData(null);
      setMapping({});
      setDrafts([]);
      setPasteText("");
      setFileName(null);
      setImportBusy(false);
    }
  }, [open]);

  const loadText = (text: string) => {
    const parsed = parseImportText(text);
    if (!parsed) return;
    const nextMapping = detectImportMapping(parsed.headers);
    setRawData(parsed);
    setMapping(nextMapping);
    setDrafts(buildImportDrafts(parsed.rows, nextMapping));
  };

  const analyses = React.useMemo(
    () => drafts.map((draft) => analyzeImportDraft(draft, classrooms)),
    [drafts, classrooms]
  );
  const planResult = React.useMemo(
    () => buildStudentImportPlan(analyses, existingStudents),
    [analyses, existingStudents]
  );

  const issuesById = React.useMemo(() => {
    const map = new Map<string, ImportIssue[]>();
    analyses.forEach((analysis) => map.set(analysis.draft.id, [...analysis.issues]));
    planResult.duplicateIssues.forEach((issues, id) => {
      map.set(id, [...(map.get(id) ?? []), ...issues]);
    });
    return map;
  }, [analyses, planResult]);

  const issueCount = Array.from(issuesById.values()).reduce(
    (sum, issues) => sum + issues.length,
    0
  );
  const readyRows =
    drafts.length - Array.from(issuesById.values()).filter((issues) => issues.length > 0).length;
  const canImport =
    drafts.length > 0 && issueCount === 0 && !!planResult.plan && classrooms.length > 0;

  const updateDraft = (id: string, update: Partial<StudentImportDraft>) => {
    setDrafts((prev) => prev.map((draft) => (draft.id === id ? { ...draft, ...update } : draft)));
  };

  const remap = (index: number, field: ImportField) => {
    const next = { ...mapping, [index]: field };
    setMapping(next);
    if (rawData) setDrafts(buildImportDrafts(rawData.rows, next));
  };

  const applyClassroomToAll = (oldValue: string, newValue: string) => {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.classroomName.trim().toLowerCase() === oldValue.trim().toLowerCase()
          ? { ...draft, classroomName: newValue }
          : draft
      )
    );
  };

  const typoCounts = React.useMemo(() => {
    const map = new Map<string, number>();
    analyses.forEach((analysis) => {
      analysis.issues.forEach((issue) => {
        if (issue.kind === "unknown_classroom") {
          const key = issue.value.trim().toLowerCase();
          map.set(key, (map.get(key) ?? 0) + 1);
        }
      });
    });
    return map;
  }, [analyses]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[940px] max-h-[86vh] overflow-hidden rounded-[22px] border border-border bg-surface p-0 shadow-2xl">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle className="text-xl">Import children</DialogTitle>
          <p className="text-sm text-ink-secondary">
            Paste rows from a spreadsheet or upload a CSV. We will show every issue before anything
            is added.
          </p>
        </DialogHeader>

        <div className="scroll-quiet max-h-[calc(86vh-148px)] overflow-y-auto px-6 py-5">
          {!rawData ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-canvas p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-ink/15 bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-muted">
                    Upload
                    <input
                      type="file"
                      accept=".csv,text/csv,text/tab-separated-values"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        setFileName(file.name);
                        void file.text().then(loadText);
                      }}
                    />
                  </label>
                  {fileName && <span className="text-sm text-ink-muted">{fileName}</span>}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const blob = new Blob([STUDENT_IMPORT_TEMPLATE], { type: "text/csv" });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement("a");
                      link.href = url;
                      link.download = "student-import-template.csv";
                      link.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download size={15} /> Download example
                  </Button>
                </div>
              </div>
              <Textarea
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
                placeholder="Or paste spreadsheet rows here..."
                className="min-h-40 bg-canvas font-mono text-xs"
              />
              <div className="flex justify-end">
                <Button
                  type="button"
                  disabled={!pasteText.trim()}
                  onClick={() => loadText(pasteText)}
                >
                  Continue
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <section className="rounded-2xl border border-border bg-canvas p-4">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Check the columns</h3>
                    <p className="text-xs text-ink-secondary">
                      We guessed what each column means. Change anything that looks wrong.
                    </p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setRawData(null)}>
                    Use a different file
                  </Button>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {rawData.headers.map((header, index) => (
                    <label key={`${header}-${index}`} className="flex items-center gap-2 text-xs">
                      <span className="w-32 truncate text-ink-secondary" title={header}>
                        {header || `Column ${index + 1}`}
                      </span>
                      <span className="text-ink-muted">is</span>
                      <select
                        value={mapping[index] ?? "ignore"}
                        onChange={(event) => remap(index, event.target.value as ImportField)}
                        className="h-8 flex-1 rounded-md border border-ink/15 bg-surface px-2 text-xs text-ink"
                      >
                        {FIELD_OPTIONS.map((field) => (
                          <option key={field} value={field}>
                            {FIELD_LABELS[field]}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </section>

              <div className="flex flex-wrap items-center gap-2">
                {readyRows > 0 && <Badge variant="sage">{readyRows} ready</Badge>}
                {issueCount > 0 && <Badge variant="terracotta">{issueCount} to fix</Badge>}
              </div>

              <div className="space-y-3">
                {drafts.map((draft, index) => (
                  <ImportDraftCard
                    key={draft.id}
                    draft={draft}
                    analysis={analyses[index]}
                    issues={issuesById.get(draft.id) ?? []}
                    classrooms={classrooms}
                    typoCounts={typoCounts}
                    onUpdate={updateDraft}
                    onRemove={() =>
                      setDrafts((prev) => prev.filter((item) => item.id !== draft.id))
                    }
                    onApplyClassroomToAll={applyClassroomToAll}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canImport || importBusy}
            onClick={() => {
              if (!planResult.plan || importBusy) return;
              setImportBusy(true);
              void Promise.resolve(onImport(planResult.plan))
                .then(() => onOpenChange(false))
                .finally(() => setImportBusy(false));
            }}
          >
            {importBusy
              ? "Importing…"
              : canImport
                ? `Import ${planResult.plan?.newStudents.length ?? 0} children`
                : `Fix ${issueCount} issue${issueCount === 1 ? "" : "s"} first`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ImportDraftCard({
  draft,
  analysis,
  issues,
  classrooms,
  typoCounts,
  onUpdate,
  onRemove,
  onApplyClassroomToAll,
}: {
  draft: StudentImportDraft;
  analysis: DraftAnalysis;
  issues: ImportIssue[];
  classrooms: ClassroomOption[];
  typoCounts: Map<string, number>;
  onUpdate: (id: string, update: Partial<StudentImportDraft>) => void;
  onRemove: () => void;
  onApplyClassroomToAll: (oldValue: string, newValue: string) => void;
}) {
  const hasIssues = issues.length > 0;
  return (
    <section
      className={
        hasIssues
          ? "rounded-2xl border border-terracotta/40 bg-terracotta/10 p-4"
          : "rounded-2xl border border-border bg-canvas p-4"
      }
    >
      <div className="mb-3 flex items-center gap-2">
        {hasIssues ? (
          <AlertTriangle size={16} className="text-terracotta" />
        ) : (
          <Check size={16} className="text-sage" />
        )}
        <span className="label-cap text-ink-muted">Row {draft.sourceRow}</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onRemove}
          className="rounded-md p-1 text-ink-muted hover:bg-ink/5"
        >
          <X size={16} />
        </button>
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_1fr_140px_1.2fr]">
        <MiniInput
          label="First name"
          value={draft.firstName}
          onChange={(value) => onUpdate(draft.id, { firstName: value })}
        />
        <MiniInput
          label="Last name"
          value={draft.lastName}
          onChange={(value) => onUpdate(draft.id, { lastName: value })}
        />
        <MiniInput
          label="Birthday (optional)"
          value={draft.birthDate}
          onChange={(value) => onUpdate(draft.id, { birthDate: value })}
        />
        <MiniInput
          label="Classroom"
          value={draft.classroomName}
          onChange={(value) => onUpdate(draft.id, { classroomName: value })}
        />
      </div>

      <div className="mt-2 grid gap-2 md:grid-cols-[1fr_1.3fr_130px_130px]">
        <MiniInput
          label="Guardian"
          value={draft.guardianName}
          onChange={(value) => onUpdate(draft.id, { guardianName: value })}
        />
        <MiniInput
          label="Guardian email"
          value={draft.guardianEmail}
          onChange={(value) => onUpdate(draft.id, { guardianEmail: value })}
        />
        <MiniInput
          label="Phone (optional)"
          value={draft.guardianPhone}
          onChange={(value) => onUpdate(draft.id, { guardianPhone: value })}
        />
        <MiniInput
          label="Relation"
          value={draft.guardianRelationship}
          onChange={(value) => onUpdate(draft.id, { guardianRelationship: value })}
        />
      </div>

      {analysis.dateHint && !hasIssues && (
        <p className="mt-2 text-xs text-ink-muted">{analysis.dateHint}</p>
      )}

      {hasIssues && (
        <div className="mt-3 space-y-2">
          {issues.map((issue, index) => (
            <IssueMessage
              key={`${issue.kind}-${index}`}
              issue={issue}
              draft={draft}
              classrooms={classrooms}
              typoCounts={typoCounts}
              onUpdate={onUpdate}
              onApplyClassroomToAll={onApplyClassroomToAll}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function MiniInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <div className="label-cap mb-1 text-ink-muted">{label}</div>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 bg-surface"
      />
    </label>
  );
}

function IssueMessage({
  issue,
  draft,
  classrooms,
  typoCounts,
  onUpdate,
  onApplyClassroomToAll,
}: {
  issue: ImportIssue;
  draft: StudentImportDraft;
  classrooms: ClassroomOption[];
  typoCounts: Map<string, number>;
  onUpdate: (id: string, update: Partial<StudentImportDraft>) => void;
  onApplyClassroomToAll: (oldValue: string, newValue: string) => void;
}) {
  const shell = "rounded-xl border border-terracotta/20 bg-surface px-3 py-2 text-sm text-ink";

  if (issue.kind === "missing_name")
    return <div className={shell}>Add both a first name and a last name.</div>;
  if (issue.kind === "invalid_birth_date") {
    return (
      <div className={shell}>
        Birthday &quot;{issue.value}&quot; could not be read. Try 2019-04-15, 15 April 2019, or
        04/15/2019 — or clear the field.
      </div>
    );
  }
  if (issue.kind === "invalid_guardian_email") {
    return (
      <div className={shell}>
        Guardian email &quot;{issue.value}&quot; is not valid. Fix it or clear the email field.
      </div>
    );
  }
  if (issue.kind === "guardian_incomplete") {
    return (
      <div className={shell}>
        Add a valid guardian email (name optional), or both guardian first and last name with a
        valid email, or clear guardian fields. Phone is optional and needs email or both names.
      </div>
    );
  }
  if (issue.kind === "duplicate_without_guardian") {
    return (
      <div className={shell}>
        {issue.name} already exists. Remove this row or add a guardian to it.
      </div>
    );
  }
  if (issue.kind === "missing_classroom") {
    return (
      <div className={`${shell} flex flex-wrap items-center gap-2`}>
        <span>Choose a classroom for this child.</span>
        <ClassroomPicker
          classrooms={classrooms}
          onPick={(name) => onUpdate(draft.id, { classroomName: name })}
        />
      </div>
    );
  }
  if (issue.kind === "unknown_classroom") {
    const count = typoCounts.get(issue.value.trim().toLowerCase()) ?? 1;
    return (
      <div className={`${shell} flex flex-wrap items-center gap-2`}>
        <span>Classroom &quot;{issue.value}&quot; does not exist.</span>
        {issue.suggestion && (
          <>
            <span>
              Did you mean <strong>{issue.suggestion.name}</strong>?
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onUpdate(draft.id, { classroomName: issue.suggestion!.name })}
            >
              Use it
            </Button>
            {count > 1 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onApplyClassroomToAll(issue.value, issue.suggestion!.name)}
              >
                Apply to all {count}
              </Button>
            )}
          </>
        )}
        <ClassroomPicker
          classrooms={classrooms}
          onPick={(name) => onUpdate(draft.id, { classroomName: name })}
        />
      </div>
    );
  }
  return null;
}

function ClassroomPicker({
  classrooms,
  onPick,
}: {
  classrooms: ClassroomOption[];
  onPick: (name: string) => void;
}) {
  return (
    <select
      value=""
      onChange={(event) => {
        const classroom = classrooms.find((item) => item.id === event.target.value);
        if (classroom) onPick(classroom.name);
      }}
      className="h-8 rounded-md border border-ink/15 bg-canvas px-2 text-xs text-ink"
    >
      <option value="">Pick classroom</option>
      {classrooms.map((classroom) => (
        <option key={classroom.id} value={classroom.id}>
          {classroom.name}
        </option>
      ))}
    </select>
  );
}
