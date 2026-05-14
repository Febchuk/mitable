"use client";

import * as React from "react";
import Link from "next/link";
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
  UserMinus,
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
  listSchoolStudentsMatchingName,
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
  curriculumId?: string | null;
  curriculumName?: string | null;
  mainTeacherId?: string;
  programTypes: ProgressProgram[];
  teachers: ApiClassroomTeacher[];
};

type ApiTeacher = { id: string; name: string };

type ApiClassroomTeacher = {
  assignmentId: string;
  userId: string;
  name: string;
  role: string;
};

type ApiClassroom = {
  id: string;
  name: string;
  code: string | null;
  curriculumId: string | null;
  curriculumName: string | null;
  leadTeacherId: string | null;
  programTypes: ProgressProgram[];
  teachers: ApiClassroomTeacher[];
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
  montessoriCurricula: Array<{ id: string; name: string }>;
};

type SchoolRosterApiStudent = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  birthDate: string | null;
  guardianCount: number;
  enrolledEarliest: string | null;
  classrooms: Array<{ id: string; name: string }>;
};

type SchoolRosterPickOption = {
  id: string;
  label: string;
  hint: string;
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
  const [montessoriCurricula, setMontessoriCurricula] = React.useState<
    Array<{ id: string; name: string }>
  >([]);
  const [schoolStudentsForImport, setSchoolStudentsForImport] = React.useState<
    Array<{ id: string; firstName: string; lastName: string }>
  >([]);
  const [schoolRosterPickOptions, setSchoolRosterPickOptions] = React.useState<
    SchoolRosterPickOption[]
  >([]);

  const reload = React.useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);
    try {
      const [data, schoolR] = await Promise.all([
        apiJson<OverviewResponse>("/api/admin/classrooms"),
        apiJson<{ students: SchoolRosterApiStudent[] }>("/api/admin/school-roster"),
      ]);
      setMontessoriCurricula(data.montessoriCurricula ?? []);
      const schoolStudents = (schoolR.students ?? []).map((s) => ({
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
      }));
      setSchoolStudentsForImport(schoolStudents);
      setSchoolRosterPickOptions(
        (schoolR.students ?? []).map((s) => ({
          id: s.id,
          label: `${s.firstName} ${s.lastName}`.trim(),
          hint:
            s.classrooms.length > 0
              ? s.classrooms.map((c) => c.name).join(", ")
              : "No classroom yet",
        }))
      );
      const mappedClassrooms: AdminClassroom[] = data.classrooms.map((c) => ({
        id: c.id,
        name: c.name,
        level: c.code ?? "",
        curriculumId: c.curriculumId,
        curriculumName: c.curriculumName,
        mainTeacherId: c.leadTeacherId ?? undefined,
        teachers: Array.isArray(c.teachers) ? c.teachers : [],
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

  const applyImportPlan = async (
    plan: StudentImportPlan,
    nameMatchPicks: Record<string, "new" | string> = {}
  ) => {
    setMutationError(null);
    try {
      for (const s of plan.newStudents) {
        const matches = listSchoolStudentsMatchingName(
          s.firstName,
          s.lastName,
          schoolStudentsForImport
        );

        let studentId: string;
        if (matches.length > 0) {
          const pick = nameMatchPicks[s.draftId];
          if (!pick) {
            throw new Error("Resolve same-name warnings on highlighted rows before importing.");
          }
          if (pick !== "new") {
            if (!matches.some((m) => m.id === pick)) {
              throw new Error("Stale student selection — reopen import and pick again.");
            }
            await apiJson<{ ok: boolean }>("/api/admin/student-enrollments", {
              method: "POST",
              body: JSON.stringify({ student_id: pick, classroom_id: s.classroomId }),
            });
            studentId = pick;
          } else {
            const created = await apiJson<{ ok: boolean; id: string }>("/api/admin/students", {
              method: "POST",
              body: JSON.stringify({
                first_name: s.firstName,
                last_name: s.lastName,
                ...(s.birthDate ? { birth_date: s.birthDate } : {}),
                classroom_id: s.classroomId,
              }),
            });
            studentId = created.id;
          }
        } else {
          const created = await apiJson<{ ok: boolean; id: string }>("/api/admin/students", {
            method: "POST",
            body: JSON.stringify({
              first_name: s.firstName,
              last_name: s.lastName,
              ...(s.birthDate ? { birth_date: s.birthDate } : {}),
              classroom_id: s.classroomId,
            }),
          });
          studentId = created.id;
        }

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

  const enrollExistingChild = async (studentId: string) => {
    if (!selectedClassroomId) return;
    setMutationError(null);
    try {
      await apiJson<{ ok: boolean }>("/api/admin/student-enrollments", {
        method: "POST",
        body: JSON.stringify({ student_id: studentId, classroom_id: selectedClassroomId }),
      });
      await reload();
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : "Could not add child to this classroom");
      throw e;
    }
  };

  /** Enroll an existing student in the selected class, then attach guardians from the same form
   *  shape as manual add (optional). */
  const enrollExistingChildWithGuardians = async (
    studentId: string,
    input: {
      guardianFirstName?: string;
      guardianLastName?: string;
      guardianEmail?: string;
      guardianPhone?: string;
    }
  ) => {
    if (!selectedClassroomId) return;
    setMutationError(null);
    try {
      await apiJson<{ ok: boolean }>("/api/admin/student-enrollments", {
        method: "POST",
        body: JSON.stringify({ student_id: studentId, classroom_id: selectedClassroomId }),
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
            student_id: studentId,
            guardian_id: guardianRow.id,
            relationship: "guardian",
            is_primary_contact: false,
            receives_reports: true,
          }),
        });
      }
      await reload();
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : "Could not add child to this classroom");
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

  const setClassroomCurriculum = async (classroomId: string, curriculumId: string | null) => {
    setMutationError(null);
    try {
      await apiJson("/api/admin/classrooms", {
        method: "PATCH",
        body: JSON.stringify({ classroom_id: classroomId, curriculum_id: curriculumId }),
      });
      await reload();
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : "Could not update curriculum");
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

  const assignTeacherToRoom = async (
    classroomId: string,
    teacherUserId: string,
    role: "lead" | "support" | "assistant"
  ) => {
    setMutationError(null);
    try {
      await apiJson("/api/admin/classroom-teachers", {
        method: "POST",
        body: JSON.stringify({
          classroom_id: classroomId,
          teacher_user_id: teacherUserId,
          classroom_role: role,
          start_date: new Date().toISOString().slice(0, 10),
        }),
      });
      await reload();
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : "Could not add teacher");
    }
  };

  const removeTeacherFromRoom = async (assignmentId: string) => {
    setMutationError(null);
    try {
      await apiJson("/api/admin/classroom-teachers", {
        method: "DELETE",
        body: JSON.stringify({
          assignment_id: assignmentId,
          end_date: new Date().toISOString().slice(0, 10),
        }),
      });
      await reload();
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : "Could not remove teacher");
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
                <ClassroomStaffPanel
                  classroomId={selectedClassroom.id}
                  teachers={selectedClassroom.teachers}
                  teacherPool={teacherPool}
                  onAdd={(teacherUserId, role) =>
                    void assignTeacherToRoom(selectedClassroom.id, teacherUserId, role)
                  }
                  onRemove={(assignmentId) => void removeTeacherFromRoom(assignmentId)}
                />
                <ProgramTypesEditor
                  value={selectedClassroom.programTypes}
                  onSave={(next) => setClassroomPrograms(selectedClassroom.id, next)}
                />
                <MontessoriCurriculumPicker
                  programTypes={selectedClassroom.programTypes}
                  curriculumId={selectedClassroom.curriculumId ?? null}
                  curriculumName={selectedClassroom.curriculumName ?? null}
                  options={montessoriCurricula}
                  onPick={(next) => setClassroomCurriculum(selectedClassroom.id, next)}
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
        schoolStudentsForImport={schoolStudentsForImport}
        onImport={(plan, nameMatchPicks) => applyImportPlan(plan, nameMatchPicks)}
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
        classroomId={selectedClassroomId}
        rosterPickOptions={schoolRosterPickOptions.filter(
          (o) =>
            !children.some(
              (c) => c.id === o.id && selectedClassroomId && c.classroomId === selectedClassroomId
            )
        )}
        schoolStudentsForImport={schoolStudentsForImport}
        onAdd={addChildManually}
        onEnrollExisting={(studentId) => enrollExistingChild(studentId)}
        onEnrollExistingWithGuardians={(studentId, guardianInput) =>
          enrollExistingChildWithGuardians(studentId, guardianInput)
        }
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

function classroomRoleLabel(role: string): string {
  if (role === "lead") return "Lead";
  if (role === "assistant") return "Assistant";
  return "Support";
}

function ClassroomStaffPanel({
  classroomId,
  teachers,
  teacherPool,
  onAdd,
  onRemove,
}: {
  classroomId: string;
  teachers: ApiClassroomTeacher[];
  teacherPool: ApiTeacher[];
  onAdd: (teacherUserId: string, role: "lead" | "support" | "assistant") => void | Promise<void>;
  onRemove: (assignmentId: string) => void | Promise<void>;
}) {
  const [pickId, setPickId] = React.useState("");
  const [pickRole, setPickRole] = React.useState<"lead" | "support" | "assistant">("support");
  const [busyKey, setBusyKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    setPickId("");
    setPickRole("support");
    setBusyKey(null);
  }, [classroomId]);

  const assigned = React.useMemo(() => new Set(teachers.map((t) => t.userId)), [teachers]);
  const available = React.useMemo(
    () => teacherPool.filter((t) => !assigned.has(t.id)),
    [teacherPool, assigned]
  );

  const canAdd = pickId.length > 0 && available.some((t) => t.id === pickId);

  return (
    <div
      style={{
        marginTop: 12,
        paddingTop: 14,
        borderTop: "1px solid var(--color-border)",
      }}
    >
      <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 8 }}>
        Teachers
      </div>
      {teachers.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--color-ink-secondary)", marginBottom: 10 }}>
          No teachers assigned yet. Add staff from the list below (invite teachers under Staff if
          the list is empty).
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: "0 0 12px", padding: 0 }}>
          {teachers.map((t, index) => (
            <li
              key={t.assignmentId}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "8px 0",
                borderTop: index ? "1px solid var(--color-border)" : undefined,
                fontSize: 14,
              }}
            >
              <span style={{ fontWeight: 600, color: "var(--color-ink)" }}>{t.name}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: "var(--color-canvas)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-ink-muted)",
                  }}
                >
                  {classroomRoleLabel(t.role)}
                </span>
                <button
                  type="button"
                  className="tap rounded-md p-2 text-ink-muted hover:bg-ink/5 hover:text-status-error"
                  title={`Remove ${t.name} from this classroom`}
                  aria-label={`Remove ${t.name} from this classroom`}
                  disabled={busyKey !== null}
                  onClick={() => {
                    setBusyKey(t.assignmentId);
                    void Promise.resolve(onRemove(t.assignmentId)).finally(() => setBusyKey(null));
                  }}
                >
                  <UserMinus size={16} strokeWidth={1.5} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {available.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
          {teacherPool.length === 0
            ? "No teachers in your school yet. Add them under Staff."
            : "Every active teacher is already assigned to this classroom."}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-end",
            gap: 10,
            marginTop: 4,
          }}
        >
          <label style={{ flex: "1 1 200px", minWidth: 0 }}>
            <div className="label-cap mb-1" style={{ color: "var(--color-ink-muted)" }}>
              Add teacher
            </div>
            <select
              value={pickId}
              onChange={(e) => setPickId(e.target.value)}
              className="h-10 w-full rounded-md border border-ink/15 bg-canvas px-2 text-sm text-ink"
            >
              <option value="">Choose…</option>
              {available.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: "0 1 140px" }}>
            <div className="label-cap mb-1" style={{ color: "var(--color-ink-muted)" }}>
              Role
            </div>
            <select
              value={pickRole}
              onChange={(e) => setPickRole(e.target.value as "lead" | "support" | "assistant")}
              className="h-10 w-full rounded-md border border-ink/15 bg-canvas px-2 text-sm text-ink"
            >
              <option value="support">Support</option>
              <option value="assistant">Assistant</option>
              <option value="lead">Lead</option>
            </select>
          </label>
          <Button
            type="button"
            variant="secondary"
            disabled={!canAdd || busyKey !== null}
            onClick={() => {
              if (!canAdd) return;
              setBusyKey("add");
              void Promise.resolve(onAdd(pickId, pickRole)).finally(() => {
                setBusyKey(null);
                setPickId("");
              });
            }}
          >
            Add to classroom
          </Button>
        </div>
      )}
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
  classroomId,
  rosterPickOptions,
  schoolStudentsForImport,
  onAdd,
  onEnrollExisting,
  onEnrollExistingWithGuardians,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classroomName: string;
  classroomId: string | null;
  rosterPickOptions: SchoolRosterPickOption[];
  schoolStudentsForImport: Array<{ id: string; firstName: string; lastName: string }>;
  onAdd: (input: {
    firstName: string;
    lastName: string;
    birthDate?: string;
    guardianFirstName?: string;
    guardianLastName?: string;
    guardianEmail?: string;
    guardianPhone?: string;
  }) => void | Promise<void>;
  onEnrollExisting: (studentId: string) => void | Promise<void>;
  onEnrollExistingWithGuardians: (
    studentId: string,
    input: {
      guardianFirstName?: string;
      guardianLastName?: string;
      guardianEmail?: string;
      guardianPhone?: string;
    }
  ) => void | Promise<void>;
}) {
  const [mode, setMode] = React.useState<"new" | "roster">("new");
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [birthDate, setBirthDate] = React.useState("");
  const [guardianFirstName, setGuardianFirstName] = React.useState("");
  const [guardianLastName, setGuardianLastName] = React.useState("");
  const [guardianEmail, setGuardianEmail] = React.useState("");
  const [guardianPhone, setGuardianPhone] = React.useState("");
  const [rosterSearch, setRosterSearch] = React.useState("");
  const [pickedStudentId, setPickedStudentId] = React.useState<string | null>(null);
  const [enrollBusy, setEnrollBusy] = React.useState(false);
  const [duplicatePickId, setDuplicatePickId] = React.useState<string | null>(null);
  const [duplicateBusy, setDuplicateBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setMode("new");
      setFirstName("");
      setLastName("");
      setBirthDate("");
      setGuardianFirstName("");
      setGuardianLastName("");
      setGuardianEmail("");
      setGuardianPhone("");
      setRosterSearch("");
      setPickedStudentId(null);
      setEnrollBusy(false);
      setDuplicatePickId(null);
      setDuplicateBusy(false);
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

  const canSubmitNew =
    firstName.trim().length > 0 && lastName.trim().length > 0 && !guardianPartial;

  const nameMatches = React.useMemo(
    () => listSchoolStudentsMatchingName(firstName, lastName, schoolStudentsForImport),
    [firstName, lastName, schoolStudentsForImport]
  );

  React.useEffect(() => {
    const matches = listSchoolStudentsMatchingName(firstName, lastName, schoolStudentsForImport);
    if (matches.length === 0) setDuplicatePickId(null);
    else if (matches.length === 1) setDuplicatePickId(matches[0].id);
    else
      setDuplicatePickId((prev) =>
        prev && matches.some((m) => m.id === prev) ? prev : matches[0].id
      );
  }, [firstName, lastName, schoolStudentsForImport]);

  const hasDuplicateName = canSubmitNew && nameMatches.length > 0;
  const guardianPayload = {
    guardianFirstName: gf || undefined,
    guardianLastName: gl || undefined,
    guardianEmail: ge || undefined,
    guardianPhone: gp || undefined,
  };

  const filteredRoster = React.useMemo(() => {
    const q = rosterSearch.trim().toLowerCase();
    if (!q) return rosterPickOptions;
    return rosterPickOptions.filter(
      (o) => o.label.toLowerCase().includes(q) || o.hint.toLowerCase().includes(q)
    );
  }, [rosterPickOptions, rosterSearch]);

  const dateInputClassName =
    "h-10 bg-canvas text-left [&::-webkit-calendar-picker-indicator]:ml-auto [&::-webkit-calendar-picker-indicator]:cursor-pointer";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] rounded-[22px] border border-border bg-surface p-0 shadow-2xl">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle className="text-xl">Add child</DialogTitle>
          <p className="text-sm text-ink-secondary">Adding to {classroomName}.</p>
          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === "new" ? "default" : "secondary"}
              onClick={() => setMode("new")}
            >
              New child
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "roster" ? "default" : "secondary"}
              onClick={() => setMode("roster")}
              disabled={!classroomId}
            >
              From school roster
            </Button>
          </div>
        </DialogHeader>

        {mode === "new" ? (
          <>
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
                    Use a valid email (names optional with email), or both first and last name, or
                    leave guardian fields blank. Add a phone only together with a valid email or
                    with both names.
                  </p>
                )}
              </div>

              {hasDuplicateName && classroomId ? (
                <div className="rounded-xl border border-terracotta/35 bg-terracotta/10 px-4 py-3 text-sm text-ink">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-terracotta" />
                    <div>
                      <p className="font-medium">
                        A child with this first and last name is already on the school roster.
                      </p>
                      <p className="mt-1 text-xs text-ink-secondary">
                        Add that student to this classroom (same person), or create a second record
                        only if this is a different child.
                      </p>
                    </div>
                  </div>
                  {nameMatches.length > 1 ? (
                    <div className="mt-3 space-y-1">
                      <div className="label-cap text-ink-muted">Which existing child?</div>
                      <select
                        className="h-9 w-full max-w-md rounded-md border border-ink/15 bg-surface px-2 text-sm text-ink"
                        value={duplicatePickId ?? ""}
                        onChange={(e) => setDuplicatePickId(e.target.value || null)}
                      >
                        {nameMatches.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.firstName} {c.lastName}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={duplicateBusy || !duplicatePickId}
                      onClick={() => {
                        const sid = nameMatches.length === 1 ? nameMatches[0].id : duplicatePickId;
                        if (!sid) return;
                        setDuplicateBusy(true);
                        void Promise.resolve(onEnrollExistingWithGuardians(sid, guardianPayload))
                          .then(() => onOpenChange(false))
                          .finally(() => setDuplicateBusy(false));
                      }}
                    >
                      {duplicateBusy ? "Adding…" : "Add existing child to this class"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={duplicateBusy}
                      onClick={() => {
                        setDuplicateBusy(true);
                        void Promise.resolve(
                          onAdd({
                            firstName,
                            lastName,
                            birthDate: birthDate.trim() || undefined,
                            guardianFirstName: gf || undefined,
                            guardianLastName: gl || undefined,
                            guardianEmail: ge || undefined,
                            guardianPhone: gp || undefined,
                          })
                        )
                          .then(() => onOpenChange(false))
                          .finally(() => setDuplicateBusy(false));
                      }}
                    >
                      Create new student record anyway
                    </Button>
                  </div>
                </div>
              ) : hasDuplicateName && !classroomId ? (
                <p className="text-xs text-terracotta">Pick a classroom first.</p>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!canSubmitNew || hasDuplicateName}
                onClick={() => {
                  if (!canSubmitNew || hasDuplicateName) return;
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
          </>
        ) : (
          <>
            <div className="space-y-3 px-6 py-5">
              <p className="text-xs text-ink-secondary">
                Pick someone already on the school roster. They stay one person across classrooms;
                this only adds them to {classroomName}.
              </p>
              <Input
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                placeholder="Search by name or current classroom…"
                className="h-10 bg-canvas"
              />
              <div
                className="scroll-quiet max-h-[280px] overflow-y-auto rounded-xl border border-border bg-canvas"
                role="listbox"
              >
                {filteredRoster.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-ink-muted">
                    {rosterPickOptions.length === 0
                      ? "No students on the school roster yet."
                      : "No matches — try another search."}
                  </div>
                ) : (
                  filteredRoster.map((o) => {
                    const active = pickedStudentId === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        className="tap flex w-full flex-col items-start gap-0.5 border-b border-border px-4 py-3 text-left last:border-b-0"
                        style={{
                          background: active ? "var(--color-terracotta-soft)" : "transparent",
                        }}
                        onClick={() => setPickedStudentId(o.id)}
                      >
                        <span className="text-sm font-semibold text-ink">{o.label}</span>
                        <span className="text-xs text-ink-muted">{o.hint}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!pickedStudentId || enrollBusy || !classroomId}
                onClick={() => {
                  if (!pickedStudentId || !classroomId) return;
                  setEnrollBusy(true);
                  void Promise.resolve(onEnrollExisting(pickedStudentId))
                    .then(() => onOpenChange(false))
                    .finally(() => setEnrollBusy(false));
                }}
              >
                {enrollBusy ? "Adding…" : "Add to this classroom"}
              </Button>
            </div>
          </>
        )}
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

function MontessoriCurriculumPicker({
  programTypes,
  curriculumId,
  curriculumName,
  options,
  onPick,
}: {
  programTypes: ProgressProgram[];
  curriculumId: string | null;
  curriculumName: string | null;
  options: Array<{ id: string; name: string }>;
  onPick: (curriculumId: string | null) => Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);
  const montessoriOn = programTypes.includes("montessori");

  const selectOptions = React.useMemo(() => {
    if (curriculumId && !options.some((o) => o.id === curriculumId)) {
      return [
        { id: curriculumId, name: curriculumName?.trim() ? curriculumName : "Assigned curriculum" },
        ...options,
      ];
    }
    return options;
  }, [curriculumId, curriculumName, options]);

  if (!montessoriOn) return null;

  return (
    <div style={{ marginTop: 10, maxWidth: 360 }}>
      <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 4 }}>
        Montessori curriculum
      </div>
      {selectOptions.length === 0 ? (
        <p
          style={{ margin: 0, fontSize: 12, color: "var(--color-ink-secondary)", lineHeight: 1.45 }}
        >
          No active Montessori curriculum exists for your school yet. Teachers need one to use the
          Progress grid.{" "}
          <Link href="/admin/curriculum" className="underline">
            Open Curriculum
          </Link>
          .
        </p>
      ) : (
        <select
          className="tap"
          disabled={busy}
          value={curriculumId ?? ""}
          onChange={(event) => {
            const v = event.target.value;
            const next = v === "" ? null : v;
            setBusy(true);
            void (async () => {
              try {
                await onPick(next);
              } finally {
                setBusy(false);
              }
            })();
          }}
          style={{
            width: "100%",
            maxWidth: 340,
            fontSize: 13,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid var(--color-border)",
            background: "var(--color-canvas)",
            color: "var(--color-ink)",
            fontFamily: "inherit",
          }}
        >
          <option value="">None — Progress grid hidden for this class</option>
          {selectOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
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
      <Link
        href={`/app/children/${child.id}?from=admin-classrooms`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          textDecoration: "none",
          color: "inherit",
        }}
      >
        <Avatar initials={initialsFor(child.name)} tone={child.tone} size={34} />
        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--color-ink)" }}>{child.name}</div>
      </Link>
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
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        borderTop: index ? "1px solid var(--color-border)" : "0",
      }}
    >
      <Link
        href={`/app/children/${child.id}?from=admin-classrooms`}
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 12,
          textDecoration: "none",
          color: "inherit",
        }}
      >
        <Avatar initials={initialsFor(child.name)} tone={child.tone} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: "var(--color-ink)" }}>
            {child.name}
          </div>
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
      </Link>
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
  schoolStudentsForImport,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classrooms: ClassroomOption[];
  existingStudents: Array<{ id: string; name: string; birthDate?: string; classroomId?: string }>;
  schoolStudentsForImport: Array<{ id: string; firstName: string; lastName: string }>;
  onImport: (
    plan: StudentImportPlan,
    nameMatchPicks: Record<string, "new" | string>
  ) => void | Promise<void>;
}) {
  const [rawData, setRawData] = React.useState<RawImportData | null>(null);
  const [mapping, setMapping] = React.useState<ImportMapping>({});
  const [drafts, setDrafts] = React.useState<StudentImportDraft[]>([]);
  const [pasteText, setPasteText] = React.useState("");
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [importBusy, setImportBusy] = React.useState(false);
  const [nameMatchPicks, setNameMatchPicks] = React.useState<Record<string, "new" | string>>({});

  React.useEffect(() => {
    if (!open) {
      setRawData(null);
      setMapping({});
      setDrafts([]);
      setPasteText("");
      setFileName(null);
      setImportBusy(false);
      setNameMatchPicks({});
    }
  }, [open]);

  const draftIdsKey = drafts.map((d) => d.id).join("|");
  React.useEffect(() => {
    setNameMatchPicks({});
  }, [draftIdsKey]);

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

  const nameMatchBlockers = React.useMemo(() => {
    const plan = planResult.plan;
    if (!plan) return 0;
    let n = 0;
    for (const s of plan.newStudents) {
      const matches = listSchoolStudentsMatchingName(
        s.firstName,
        s.lastName,
        schoolStudentsForImport
      );
      if (matches.length === 0) continue;
      const pick = nameMatchPicks[s.draftId];
      if (!pick) n++;
    }
    return n;
  }, [planResult.plan, schoolStudentsForImport, nameMatchPicks]);

  const issueCount = Array.from(issuesById.values()).reduce(
    (sum, issues) => sum + issues.length,
    0
  );
  const readyRows =
    drafts.length - Array.from(issuesById.values()).filter((issues) => issues.length > 0).length;
  const canImport =
    drafts.length > 0 &&
    issueCount === 0 &&
    !!planResult.plan &&
    classrooms.length > 0 &&
    nameMatchBlockers === 0;

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
                {nameMatchBlockers > 0 && (
                  <Badge variant="terracotta">
                    {nameMatchBlockers} same-name choice{nameMatchBlockers === 1 ? "" : "s"}
                  </Badge>
                )}
              </div>

              <div className="space-y-3">
                {drafts.map((draft, index) => {
                  const ns = planResult.plan?.newStudents.find((row) => row.draftId === draft.id);
                  const nameMatches = ns
                    ? listSchoolStudentsMatchingName(
                        ns.firstName,
                        ns.lastName,
                        schoolStudentsForImport
                      )
                    : [];
                  return (
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
                      nameMatchCandidates={nameMatches}
                      nameMatchPick={
                        ns && nameMatches.length > 0 ? nameMatchPicks[draft.id] : undefined
                      }
                      onNameMatchPick={(pick) =>
                        setNameMatchPicks((prev) => ({ ...prev, [draft.id]: pick }))
                      }
                    />
                  );
                })}
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
              void Promise.resolve(onImport(planResult.plan, nameMatchPicks))
                .then(() => onOpenChange(false))
                .finally(() => setImportBusy(false));
            }}
          >
            {importBusy
              ? "Importing…"
              : canImport
                ? `Import ${planResult.plan?.newStudents.length ?? 0} children`
                : nameMatchBlockers > 0
                  ? `Choose same-name option (${nameMatchBlockers})`
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
  nameMatchCandidates = [],
  nameMatchPick,
  onNameMatchPick,
}: {
  draft: StudentImportDraft;
  analysis: DraftAnalysis;
  issues: ImportIssue[];
  classrooms: ClassroomOption[];
  typoCounts: Map<string, number>;
  onUpdate: (id: string, update: Partial<StudentImportDraft>) => void;
  onRemove: () => void;
  onApplyClassroomToAll: (oldValue: string, newValue: string) => void;
  nameMatchCandidates?: Array<{ id: string; firstName: string; lastName: string }>;
  nameMatchPick?: "new" | string;
  onNameMatchPick?: (pick: "new" | string) => void;
}) {
  const nameMatchPending =
    Boolean(onNameMatchPick) && nameMatchCandidates.length > 0 && nameMatchPick === undefined;
  const cardAttention = issues.length > 0 || nameMatchPending;
  return (
    <section
      className={
        cardAttention
          ? "rounded-2xl border border-terracotta/40 bg-terracotta/10 p-4"
          : "rounded-2xl border border-border bg-canvas p-4"
      }
    >
      <div className="mb-3 flex items-center gap-2">
        {cardAttention ? (
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

      {nameMatchCandidates.length > 0 && onNameMatchPick ? (
        <div
          className={`mt-3 space-y-2 rounded-xl border px-3 py-3 text-sm ${
            nameMatchPick
              ? "border-ink/10 bg-surface text-ink"
              : "border-terracotta/35 bg-terracotta/10 text-ink"
          }`}
        >
          <p className="font-medium">Same first and last name as a child already at this school.</p>
          <p className="mt-1 text-xs text-ink-secondary">
            Link this row to an existing student (they are added to the classroom from this import),
            or create a second student record if this is a different child.
          </p>
          {nameMatchCandidates.length === 1 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                type="button"
                onClick={() => onNameMatchPick(nameMatchCandidates[0].id)}
              >
                Use {nameMatchCandidates[0].firstName} {nameMatchCandidates[0].lastName} (existing)
              </Button>
              <Button
                size="sm"
                variant="ghost"
                type="button"
                onClick={() => onNameMatchPick("new")}
              >
                Create new student record
              </Button>
            </div>
          ) : (
            <div className="mt-3 space-y-1">
              <div className="label-cap text-ink-muted">Which child is this row?</div>
              <select
                className="h-9 w-full max-w-md rounded-md border border-ink/15 bg-surface px-2 text-sm text-ink"
                value={nameMatchPick ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  onNameMatchPick(v === "new" ? "new" : v);
                }}
              >
                <option value="">Choose…</option>
                {nameMatchCandidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    Existing · {c.firstName} {c.lastName}
                  </option>
                ))}
                <option value="new">New student (same name, different person)</option>
              </select>
            </div>
          )}
        </div>
      ) : null}

      {analysis.dateHint && issues.length === 0 && !nameMatchPending && (
        <p className="mt-2 text-xs text-ink-muted">{analysis.dateHint}</p>
      )}

      {issues.length > 0 && (
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
