"use client";

import * as React from "react";
import { Plus, Search, Upload } from "lucide-react";
import { z } from "zod";
import {
  AddChildDialog,
  StudentImportDialog,
  type SchoolRosterPickOption,
} from "@/app/admin/classrooms/page";
import {
  RosterListView,
  ageFromBirthDate,
  formatEnrolled,
  type RosterListViewRow,
} from "@/components/roster/roster-list-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { executeStudentImportPlan } from "@/lib/admin/execute-student-import-plan";
import type { ClassroomOption, StudentImportPlan } from "@/lib/admin/student-import";

type ApiStudent = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  birthDate: string | null;
  guardianCount: number;
  enrolledEarliest: string | null;
  classrooms: Array<{ id: string; name: string }>;
};

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

function mapApiToRows(students: ApiStudent[]): RosterListViewRow[] {
  const sorted = [...students].sort(
    (a, b) =>
      a.firstName.localeCompare(b.firstName, undefined, { sensitivity: "base" }) ||
      a.lastName.localeCompare(b.lastName, undefined, { sensitivity: "base" }) ||
      a.id.localeCompare(b.id)
  );

  return sorted.map((s) => {
    const full = `${s.firstName} ${s.lastName}`.trim();
    const display = (s.preferredName?.trim() || full).trim();
    const classroomsLine =
      s.classrooms.length > 0 ? s.classrooms.map((c) => c.name).join(", ") : "—";
    const pref = s.preferredName?.trim() ?? "";
    const searchHaystack = [full, display, pref, classroomsLine]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return {
      id: s.id,
      href: `/app/children/${s.id}?from=admin-roster`,
      displayName: display,
      initialsSource: display,
      age: ageFromBirthDate(s.birthDate),
      enrolledAt: formatEnrolled(s.enrolledEarliest),
      guardianCount: s.guardianCount,
      classroomsLine,
      searchHaystack,
    };
  });
}

export default function AdminSchoolRosterPage() {
  const [allRows, setAllRows] = React.useState<RosterListViewRow[]>([]);
  const [rawStudents, setRawStudents] = React.useState<ApiStudent[]>([]);
  const [classrooms, setClassrooms] = React.useState<ClassroomOption[]>([]);
  const [search, setSearch] = React.useState("");
  const [loadState, setLoadState] = React.useState<"loading" | "idle" | "error">("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [mutationError, setMutationError] = React.useState<string | null>(null);
  const [importOpen, setImportOpen] = React.useState(false);
  const [addChildOpen, setAddChildOpen] = React.useState(false);

  const schoolStudentsForImport = React.useMemo(
    () =>
      rawStudents.map((s) => ({
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
      })),
    [rawStudents]
  );

  const existingStudentsForImport = React.useMemo(
    () =>
      rawStudents.map((s) => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`.trim(),
        birthDate: s.birthDate ?? undefined,
      })),
    [rawStudents]
  );

  const reload = React.useCallback(async () => {
    setLoadState("loading");
    setError(null);
    try {
      const [rosterData, classData] = await Promise.all([
        apiJson<{ students: ApiStudent[] }>("/api/admin/school-roster"),
        apiJson<{ classrooms: Array<{ id: string; name: string }> }>("/api/admin/classrooms"),
      ]);
      const students = rosterData.students ?? [];
      setRawStudents(students);
      setAllRows(mapApiToRows(students));
      setClassrooms((classData.classrooms ?? []).map((c) => ({ id: c.id, name: c.name })));
      setLoadState("idle");
    } catch (e) {
      setLoadState("error");
      setError(e instanceof Error ? e.message : "Could not load roster");
    }
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const applyImportPlan = async (
    plan: StudentImportPlan,
    nameMatchPicks: Record<string, "new" | string> = {}
  ) => {
    setMutationError(null);
    try {
      await executeStudentImportPlan(apiJson, plan, nameMatchPicks, schoolStudentsForImport);
      await reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Import failed";
      setMutationError(msg);
      throw e;
    }
  };

  const addChildToSchool = async (input: {
    firstName: string;
    lastName: string;
    birthDate?: string;
    guardianFirstName?: string;
    guardianLastName?: string;
    guardianEmail?: string;
    guardianPhone?: string;
  }) => {
    setMutationError(null);
    try {
      const bd = input.birthDate?.trim();
      const created = await apiJson<{ ok: boolean; id: string }>("/api/admin/students", {
        method: "POST",
        body: JSON.stringify({
          first_name: input.firstName.trim(),
          last_name: input.lastName.trim(),
          ...(bd ? { birth_date: bd } : {}),
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

  const attachGuardiansToExisting = async (
    studentId: string,
    input: {
      guardianFirstName?: string;
      guardianLastName?: string;
      guardianEmail?: string;
      guardianPhone?: string;
    }
  ) => {
    setMutationError(null);
    try {
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
      setMutationError(e instanceof Error ? e.message : "Could not add guardians");
      throw e;
    }
  };

  const q = search.trim().toLowerCase();
  const visibleRows = React.useMemo(() => {
    if (!q) return allRows;
    return allRows.filter((r) => (r.searchHaystack ?? "").includes(q));
  }, [allRows, q]);

  if (loadState === "loading") {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "var(--color-ink-muted)" }}>
        Loading roster…
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div style={{ padding: 48 }}>
        <p style={{ color: "var(--color-status-error, #b42318)" }}>{error}</p>
      </div>
    );
  }

  const total = allRows.length;
  const shown = visibleRows.length;
  const overline =
    q && total > 0
      ? `Whole school · ${shown} of ${total} ${total === 1 ? "child" : "children"}`
      : `Whole school · ${total} ${total === 1 ? "child" : "children"}`;

  const emptyMessage =
    total === 0
      ? "No children in this school yet. Add a child or import a list to get started."
      : "No children match this search. Try a different name or classroom.";

  const rosterPickOptions: SchoolRosterPickOption[] = [];

  return (
    <div
      className="flex min-h-0 flex-col"
      style={{ height: "calc(100dvh - 96px)", minHeight: 280 }}
    >
      {mutationError ? (
        <div
          className="shrink-0 border-b border-border px-6 py-2 text-sm"
          style={{ color: "var(--color-status-error, #b42318)" }}
        >
          {mutationError}
        </div>
      ) : null}

      <RosterListView
        overline={overline}
        title="Roster"
        rows={visibleRows}
        emptyMessage={emptyMessage}
        scrollMode="stickyHeader"
        toolbar={
          <div className="flex flex-col gap-4" style={{ padding: "20px 24px 16px" }}>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="default" onClick={() => setImportOpen(true)}>
                <Upload size={16} strokeWidth={1.7} /> Import children
              </Button>
              <Button variant="secondary" onClick={() => setAddChildOpen(true)}>
                <Plus size={16} strokeWidth={1.7} /> Add child
              </Button>
            </div>
            <div style={{ position: "relative", maxWidth: 400 }}>
              <Search
                size={15}
                strokeWidth={1.5}
                style={{
                  position: "absolute",
                  left: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--color-ink-muted)",
                  pointerEvents: "none",
                }}
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or classroom…"
                className="h-10 bg-canvas"
                style={{ paddingLeft: 32 }}
                aria-label="Search roster"
              />
            </div>
          </div>
        }
      />

      <StudentImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        classrooms={classrooms}
        existingStudents={existingStudentsForImport}
        schoolStudentsForImport={schoolStudentsForImport}
        allowUnassignedClassroom
        importTarget="school"
        onImport={(plan, nameMatchPicks) => applyImportPlan(plan, nameMatchPicks)}
      />

      <AddChildDialog
        open={addChildOpen}
        onOpenChange={setAddChildOpen}
        scope="school"
        classroomName="School roster"
        classroomId={null}
        rosterPickOptions={rosterPickOptions}
        schoolStudentsForImport={schoolStudentsForImport}
        onAdd={addChildToSchool}
        onAttachGuardiansOnly={(studentId, input) => attachGuardiansToExisting(studentId, input)}
      />
    </div>
  );
}
