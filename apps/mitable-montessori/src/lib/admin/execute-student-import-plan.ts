import type { StudentImportPlan } from "@/lib/admin/student-import";
import { listSchoolStudentsMatchingName } from "@/lib/admin/student-import";

export function splitPersonName(full: string): { first_name: string; last_name: string } {
  const t = full.trim();
  const space = t.indexOf(" ");
  if (space === -1) return { first_name: t || "Unknown", last_name: "" };
  return { first_name: t.slice(0, space).trim(), last_name: t.slice(space + 1).trim() };
}

export function mapGuardianRelationship(raw: string): "mother" | "father" | "guardian" | "other" {
  const x = raw.trim().toLowerCase();
  if (x.includes("mother") || x === "mom") return "mother";
  if (x.includes("father") || x === "dad") return "father";
  if (x.includes("other")) return "other";
  return "guardian";
}

type ApiJson = <T>(url: string, init?: RequestInit) => Promise<T>;

/** Runs import plan: creates students (optional classroom), links guardians, enrolls when classroomId is set. */
export async function executeStudentImportPlan(
  apiJson: ApiJson,
  plan: StudentImportPlan,
  nameMatchPicks: Record<string, "new" | string>,
  schoolStudentsForImport: Array<{ id: string; firstName: string; lastName: string }>
): Promise<void> {
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
        if (s.classroomId) {
          await apiJson<{ ok: boolean }>("/api/admin/student-enrollments", {
            method: "POST",
            body: JSON.stringify({ student_id: pick, classroom_id: s.classroomId }),
          });
        }
        studentId = pick;
      } else {
        const created = await apiJson<{ ok: boolean; id: string }>("/api/admin/students", {
          method: "POST",
          body: JSON.stringify({
            first_name: s.firstName,
            last_name: s.lastName,
            ...(s.birthDate ? { birth_date: s.birthDate } : {}),
            ...(s.classroomId ? { classroom_id: s.classroomId } : {}),
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
          ...(s.classroomId ? { classroom_id: s.classroomId } : {}),
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
}
