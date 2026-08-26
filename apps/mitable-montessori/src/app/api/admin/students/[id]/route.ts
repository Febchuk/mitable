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
        preferred_contact_method: "email" | "phone" | "either" | null;
        auth_user_id: string | null;
      }
    | {
        id: string;
        first_name: string;
        last_name: string;
        email: string | null;
        phone: string | null;
        preferred_contact_method: "email" | "phone" | "either" | null;
        auth_user_id: string | null;
      }[]
    | null;
};

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: student, error } = await supabase
    .from("students")
    .select("id, first_name, last_name, preferred_name, birth_date, sex, notes")
    .eq("id", id)
    .eq("school_id", auth.user.schoolId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: links, error: linksError } = await supabase
    .from("student_guardians")
    .select(
      "guardian_id, relationship, is_primary_contact, receives_reports, guardians(id, first_name, last_name, email, phone, preferred_contact_method, auth_user_id)"
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
      id: student.id,
      firstName: student.first_name,
      lastName: student.last_name,
      preferredName: student.preferred_name,
      birthDate: student.birth_date,
      sex: student.sex,
      notes: student.notes,
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
