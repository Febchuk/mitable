import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { requireUser } from "@/lib/api/auth";
import { auditLog } from "@/lib/audit/log";
import { listReports } from "@/lib/queries/reports";
import { getActiveClassroomForCurrentUser } from "@/lib/app/active-classroom";
import { CreateReportRequestSchema, type ReportKind } from "@/lib/schemas/report";

const KIND_TO_TYPE: Record<ReportKind, "daily" | "major" | "incident"> = {
  Daily: "daily",
  Major: "major",
  Incident: "incident",
};

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const reports = await listReports();
  return NextResponse.json({ reports });
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = CreateReportRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;

  const classroom = await getActiveClassroomForCurrentUser();
  if (!classroom) {
    return NextResponse.json({ error: "No active classroom" }, { status: 403 });
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Resolve template (if provided) so we can seed sections.
  let sections: Array<{
    id: string;
    heading: string;
    paragraphs: { id: string; html: string }[];
  }> | null = null;
  if (input.templateId) {
    const { data: tpl } = await supabase
      .from("report_templates")
      .select("id, sections, kind")
      .eq("id", input.templateId)
      .maybeSingle();
    if (tpl?.sections) {
      sections = (tpl.sections as string[]).map((heading, i) => ({
        id: `s-${i}-${heading.toLowerCase().replace(/\s+/g, "-")}`,
        heading,
        paragraphs: [{ id: `p-${i}-1`, html: "" }],
      }));
    }
  }

  // Build a quick title from the student's first name + today's date.
  const { data: student } = await supabase
    .from("students")
    .select("first_name, preferred_name")
    .eq("id", input.childId)
    .maybeSingle();
  const firstName = (student?.preferred_name || student?.first_name || "Student") as string;
  const today = new Date();
  const dayLabel = today.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const reportDate = today.toISOString().slice(0, 10);

  const { data: inserted, error } = await supabase
    .from("reports")
    .insert({
      student_id: input.childId,
      classroom_id: classroom.id,
      report_type: KIND_TO_TYPE[input.kind],
      report_date: reportDate,
      period_start: reportDate,
      period_end: reportDate,
      status: "draft",
      title: `${firstName} — ${dayLabel}`,
      body: null,
      sections,
      template_id: input.templateId ?? null,
      created_by_user_id: auth.user.userId,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return NextResponse.json(
      { error: "Failed to create report", details: error?.message },
      { status: 500 }
    );
  }

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "report.create",
    target_table: "reports",
    target_id: inserted.id as string,
    metadata: {
      kind: input.kind,
      classroom_id: classroom.id,
      has_audio: input.transcripts.length > 0,
      has_notes: input.notes.length > 0,
      template_id: input.templateId ?? null,
    },
  });

  return NextResponse.json({ reportId: inserted.id });
}
