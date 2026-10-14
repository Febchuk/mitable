import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { listTeacherClassroomsForCurrentUser } from "@/lib/app/active-classroom";
import { resolveStudentClassroomId } from "@/lib/reports/create-report-sections";
import { auditLog } from "@/lib/audit/log";

const CreateProjectLetter = z.object({ childId: z.string().uuid() });

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const parsed = CreateProjectLetter.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a child" }, { status: 400 });
  const db = createAdminClient();
  const { data: child, error: childError } = await db
    .from("students")
    .select("id, first_name, preferred_name, school_id, archived_at")
    .eq("id", parsed.data.childId)
    .eq("school_id", auth.user.schoolId)
    .maybeSingle();
  if (childError) return NextResponse.json({ error: childError.message }, { status: 500 });
  if (!child || child.archived_at)
    return NextResponse.json({ error: "Child not found" }, { status: 404 });
  const assigned = await listTeacherClassroomsForCurrentUser();
  const classroomId = await resolveStudentClassroomId(
    db,
    child.id,
    assigned.map((room) => room.id)
  );
  if (!classroomId)
    return NextResponse.json({ error: "Child is not in one of your classes" }, { status: 403 });
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const firstName = child.preferred_name || child.first_name || "Child";
  const { data: report, error } = await db
    .from("reports")
    .insert({
      student_id: child.id,
      classroom_id: classroomId,
      report_type: "project",
      report_date: date,
      period_start: date,
      period_end: date,
      reporting_period: "daily",
      status: "draft",
      title: `Project letter for ${firstName}`,
      body: null,
      sections: [
        {
          id: "project-letter",
          heading: "Project letter",
          paragraphs: [{ id: "project-letter-body", html: "" }],
        },
      ],
      section_meta: {},
      section_guidance: {},
      created_by_user_id: auth.user.userId,
    })
    .select("id")
    .single();
  if (error || !report)
    return NextResponse.json({ error: "Couldn't create project letter" }, { status: 500 });
  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "project_letter.create",
    target_table: "reports",
    target_id: report.id,
    metadata: { classroom_id: classroomId },
  });
  return NextResponse.json({ reportId: report.id });
}
