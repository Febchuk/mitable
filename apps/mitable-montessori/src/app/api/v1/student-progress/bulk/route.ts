import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { auditLog } from "@/lib/audit/log";
import { resolveClassroomForCurrentUser } from "@/lib/app/active-classroom";
import {
  PROGRESS_STATUSES,
  normalizeMarkingSchema,
  statusAllowedForSchema,
} from "@/lib/progress/marking-schemas";
import { createClient } from "@/utils/supabase/server";

const BulkProgressSchema = z.object({
  classroomId: z.string().uuid().optional(),
  updates: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        subtopicId: z.string().uuid(),
        status: z.enum(PROGRESS_STATUSES),
        comment: z.string().max(500).optional(),
      })
    )
    .min(1)
    .max(200),
});

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = BulkProgressSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const classroom = await resolveClassroomForCurrentUser(parsed.data.classroomId);
  if (!classroom) {
    return NextResponse.json({ error: "No active classroom" }, { status: 403 });
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const subtopicIds = Array.from(new Set(parsed.data.updates.map((u) => u.subtopicId)));
  const [{ data: room }, { data: subtopicRows }] = await Promise.all([
    supabase.from("classrooms").select("curriculum_id").eq("id", classroom.id).maybeSingle(),
    supabase
      .from("curriculum_subtopics")
      .select("id, curriculum_topics!inner(curriculum_id, marking_schema)")
      .in("id", subtopicIds),
  ]);
  const topicBySubtopic = new Map(
    (subtopicRows ?? []).map((row) => {
      const joined = row.curriculum_topics as
        | { curriculum_id: string; marking_schema: string }
        | Array<{ curriculum_id: string; marking_schema: string }>;
      const topic = Array.isArray(joined) ? joined[0] : joined;
      return [row.id as string, topic] as const;
    })
  );
  const invalidUpdates = parsed.data.updates.filter((update) => {
    const topic = topicBySubtopic.get(update.subtopicId);
    return (
      !topic ||
      topic.curriculum_id !== (room?.curriculum_id as string | null) ||
      !statusAllowedForSchema(update.status, normalizeMarkingSchema(topic.marking_schema))
    );
  });
  if (invalidUpdates.length > 0) {
    return NextResponse.json(
      {
        error: "Some progress values do not match the topic marking schema",
        subtopicIds: [...new Set(invalidUpdates.map((update) => update.subtopicId))],
      },
      { status: 400 }
    );
  }

  // Validate every studentId is actively enrolled in the caller's classroom.
  // RLS would reject the command insert anyway (the trigger writes to
  // student_progress, which is school-scoped), but a clean 403 here saves a
  // partial write and gives the client an actionable error.
  const studentIds = Array.from(new Set(parsed.data.updates.map((u) => u.studentId)));
  const { data: enrollments } = await supabase
    .from("student_classroom_enrollments")
    .select("student_id")
    .eq("classroom_id", classroom.id)
    .is("end_date", null)
    .in("student_id", studentIds);
  const enrolledIds = new Set((enrollments ?? []).map((r) => r.student_id as string));
  const unauthorized = studentIds.filter((id) => !enrolledIds.has(id));
  if (unauthorized.length > 0) {
    return NextResponse.json(
      { error: "Some students are not in the active classroom", studentIds: unauthorized },
      { status: 403 }
    );
  }

  // One commands row per update. The apply_command_projection() trigger
  // upserts student_progress and inserts student_progress_history atomically
  // — see supabase/migrations/0003_triggers.sql.
  const now = new Date().toISOString();
  const requestedRows = parsed.data.updates.map((update, index) => ({
    update,
    clientId: `bulk-${auth.user.userId}-${Date.now()}-${index}`,
  }));
  const rows = requestedRows.map(({ update: u, clientId }) => ({
    client_id: clientId,
    school_id: auth.user.schoolId,
    user_id: auth.user.userId,
    classroom_id: classroom.id,
    source: "text" as const,
    raw_transcript: null,
    command_type: "progress" as const,
    payload: {
      student_id: u.studentId,
      subtopic_id: u.subtopicId,
      status: u.status,
      ...(u.comment ? { comment: u.comment } : {}),
    },
    created_at: now,
    approved_at: now,
  }));

  const { data, error } = await supabase.from("commands").insert(rows).select("id, client_id");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "bulk_progress_update",
    target_table: "student_progress",
    metadata: {
      classroom_id: classroom.id,
      cell_count: rows.length,
    },
  });

  const commandIdByClientId = new Map(
    (data ?? []).map((row) => [row.client_id as string, row.id as string] as const)
  );
  return NextResponse.json({
    ok: true,
    applied: data?.length ?? 0,
    updates: requestedRows.flatMap(({ update, clientId }) => {
      const commandId = commandIdByClientId.get(clientId);
      return commandId
        ? [{ studentId: update.studentId, subtopicId: update.subtopicId, commandId }]
        : [];
    }),
  });
}
