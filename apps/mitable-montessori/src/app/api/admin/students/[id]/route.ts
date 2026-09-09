import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auditLog } from "@/lib/audit/log";
import { requireAdmin } from "@/lib/api/admin-auth";
import { adminWriteRoute } from "@/lib/admin/route-helper";
import { PatchStudentSchema } from "@/lib/schemas/admin";
import { createClient } from "@/utils/supabase/server";
import { archiveStudent, updateStudent, AdminError } from "@/lib/admin/crud";

type GuardianJoin = {
  guardian_id: string;
  relationship: "mother" | "father" | "guardian" | "other" | null;
  is_primary_contact: boolean;
  receives_reports: boolean;
  guardians:
    | {
        id: string;
        first_name: string;
        last_name: string;
        email: string | null;
        phone: string | null;
        alternative_phone: string | null;
        contact_address: string | null;
        preferred_contact_method: "email" | "phone" | "either" | null;
        auth_user_id: string | null;
      }
    | {
        id: string;
        first_name: string;
        last_name: string;
        email: string | null;
        phone: string | null;
        alternative_phone: string | null;
        contact_address: string | null;
        preferred_contact_method: "email" | "phone" | "either" | null;
        auth_user_id: string | null;
      }[]
    | null;
};

type StudentRecord = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  preferred_name: string | null;
  admission_number: string | null;
  birth_date: string | null;
  sex: string | null;
  notes: string | null;
  state: string | null;
  country: string | null;
  school_attended: string | null;
  health_info: string | null;
  religion: string | null;
  parent_marital_status: string | null;
  hospital: string | null;
  place_of_worship: string | null;
  house: string | null;
  academic_term: string | null;
  academic_year: string | null;
  term_status_changed: string | null;
  student_status: string | null;
  year_status_changed: string | null;
};

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: student, error } = await supabase
    .from("students")
    .select(
      "id, first_name, middle_name, last_name, preferred_name, admission_number, birth_date, sex, notes, " +
        "state, country, school_attended, health_info, religion, parent_marital_status, hospital, " +
        "place_of_worship, house, academic_term, academic_year, term_status_changed, student_status, year_status_changed"
    )
    .eq("id", id)
    .eq("school_id", auth.user.schoolId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const studentRecord = student as unknown as StudentRecord;

  const { data: links, error: linksError } = await supabase
    .from("student_guardians")
    .select(
      "guardian_id, relationship, is_primary_contact, receives_reports, guardians(id, first_name, last_name, email, phone, alternative_phone, contact_address, preferred_contact_method, auth_user_id)"
    )
    .eq("student_id", id)
    .order("is_primary_contact", { ascending: false });
  if (linksError) return NextResponse.json({ error: linksError.message }, { status: 500 });

  const guardians = ((links ?? []) as GuardianJoin[]).flatMap((link) => {
    const raw = Array.isArray(link.guardians) ? link.guardians[0] : link.guardians;
    if (!raw) return [];
    return [
      {
        id: raw.id,
        firstName: raw.first_name,
        lastName: raw.last_name,
        email: raw.email,
        phone: raw.phone,
        alternativePhone: raw.alternative_phone ?? "",
        contactAddress: raw.contact_address ?? "",
        preferredContactMethod: raw.preferred_contact_method ?? "either",
        relationship: link.relationship ?? "guardian",
        primary: link.is_primary_contact,
        receivesReports: link.receives_reports,
        accountActive: Boolean(raw.auth_user_id),
      },
    ];
  });

  return NextResponse.json({
    student: {
      id: studentRecord.id,
      firstName: studentRecord.first_name,
      middleName: studentRecord.middle_name ?? "",
      lastName: studentRecord.last_name,
      preferredName: studentRecord.preferred_name,
      admissionNumber: studentRecord.admission_number ?? "",
      birthDate: studentRecord.birth_date,
      sex: studentRecord.sex,
      notes: studentRecord.notes,
      state: studentRecord.state ?? "",
      country: studentRecord.country ?? "",
      schoolAttended: studentRecord.school_attended ?? "",
      healthInfo: studentRecord.health_info ?? "",
      religion: studentRecord.religion ?? "",
      parentMaritalStatus: studentRecord.parent_marital_status ?? "",
      hospital: studentRecord.hospital ?? "",
      placeOfWorship: studentRecord.place_of_worship ?? "",
      house: studentRecord.house ?? "",
      academicTerm: studentRecord.academic_term ?? "",
      academicYear: studentRecord.academic_year ?? "",
      termStatusChanged: studentRecord.term_status_changed ?? "",
      studentStatus: studentRecord.student_status ?? "",
      yearStatusChanged: studentRecord.year_status_changed ?? "",
      guardians,
    },
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid student id" }, { status: 400 });
  }
  return adminWriteRoute(
    req,
    PatchStudentSchema,
    "admin_update_student",
    async (input, adminCtx) => {
      await updateStudent(adminCtx, id, input);
      return { id };
    }
  );
}

/**
 * Soft-delete (archive) a student for the admin's school. Sets `archived_at`;
 * roster queries hide archived students.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(id)) {
    return NextResponse.json({ error: "Invalid student id" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const adminCtx = {
    supabase,
    schoolId: auth.user.schoolId,
    actorUserId: auth.user.userId,
  };

  const { data: row, error: readErr } = await supabase
    .from("students")
    .select("id, archived_at")
    .eq("id", id)
    .eq("school_id", auth.user.schoolId)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.archived_at) {
    return NextResponse.json({ error: "Student is already removed" }, { status: 409 });
  }

  try {
    await archiveStudent(adminCtx, id, "admin_classroom_roster_remove");
  } catch (err) {
    if (err instanceof AdminError) {
      const status =
        err.code === "not_found"
          ? 404
          : err.code === "conflict"
            ? 409
            : err.code === "invalid"
              ? 400
              : 500;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "admin_archive_student",
    target_table: "students",
    target_id: id,
    metadata: { source: "admin_classrooms" },
  });

  return NextResponse.json({ ok: true });
}
