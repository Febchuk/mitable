import { NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit/log";
import {
  findGuardianInSchool,
  findStudentInSchool,
  inaccessibleResource,
} from "@/lib/api/external-resource-access";
import { requireExternalApiKey } from "@/lib/api/external-api-key";
import { createAdminClient } from "@/utils/supabase/admin";

const LinkSchema = z.object({
  guardianId: z.string().uuid(),
  relationship: z.enum(["mother", "father", "guardian", "other"]).default("guardian"),
  isPrimaryContact: z.boolean().optional(),
  receivesReports: z.boolean().optional(),
});

async function authorize(request: Request, id: string, scope: "read" | "write") {
  const auth = await requireExternalApiKey(request, scope);
  if (!auth.ok) return auth;
  const result = await findStudentInSchool(id, auth.key.schoolId);
  return { ...auth, student: result.data };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const auth = await authorize(request, id, "read");
  if (!auth.ok) return auth.response;
  if (!auth.student) return inaccessibleResource("Student");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("student_guardians")
    .select(
      "relationship, is_primary_contact, receives_reports, guardians!inner(id, first_name, last_name, email, phone, preferred_contact_method, school_id)"
    )
    .eq("student_id", id)
    .eq("guardians.school_id", auth.key.schoolId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ guardians: data ?? [] });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: studentId } = await context.params;
  const auth = await authorize(request, studentId, "write");
  if (!auth.ok) return auth.response;
  if (!auth.student) return inaccessibleResource("Student");
  const parsed = LinkSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  const { data: guardian } = await findGuardianInSchool(parsed.data.guardianId, auth.key.schoolId);
  if (!guardian) return inaccessibleResource("Guardian");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("student_guardians")
    .insert({
      student_id: studentId,
      guardian_id: parsed.data.guardianId,
      relationship: parsed.data.relationship,
      is_primary_contact: parsed.data.isPrimaryContact ?? false,
      receives_reports: parsed.data.receivesReports ?? true,
    })
    .select("id, student_id, guardian_id, relationship, is_primary_contact, receives_reports")
    .single();
  if (error)
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "23505" ? 409 : 500 }
    );
  await auditLog({
    actor_id: null,
    actor_role: "system",
    action: "external_api.guardian.linked",
    target_table: "student_guardians",
    target_id: data.id,
    metadata: { api_key_id: auth.key.id },
  });
  return NextResponse.json({ link: data }, { status: 201 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: studentId } = await context.params;
  const auth = await authorize(request, studentId, "write");
  if (!auth.ok) return auth.response;
  if (!auth.student) return inaccessibleResource("Student");
  const parsed = LinkSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  const { data: guardian } = await findGuardianInSchool(parsed.data.guardianId, auth.key.schoolId);
  if (!guardian) return inaccessibleResource("Guardian");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("student_guardians")
    .update({
      relationship: parsed.data.relationship,
      is_primary_contact: parsed.data.isPrimaryContact ?? false,
      receives_reports: parsed.data.receivesReports ?? true,
    })
    .eq("student_id", studentId)
    .eq("guardian_id", parsed.data.guardianId)
    .select("id, student_id, guardian_id, relationship, is_primary_contact, receives_reports")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Guardian link not found" }, { status: 404 });
  return NextResponse.json({ link: data });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: studentId } = await context.params;
  const auth = await authorize(request, studentId, "write");
  if (!auth.ok) return auth.response;
  if (!auth.student) return inaccessibleResource("Student");
  const guardianId = new URL(request.url).searchParams.get("guardianId");
  if (!guardianId || !z.string().uuid().safeParse(guardianId).success)
    return NextResponse.json({ error: "Valid guardianId is required" }, { status: 400 });
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("student_guardians")
    .delete()
    .eq("student_id", studentId)
    .eq("guardian_id", guardianId)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Guardian link not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
