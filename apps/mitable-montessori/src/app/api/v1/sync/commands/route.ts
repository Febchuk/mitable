import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { auditLog } from "@/lib/audit/log";
import { requireUser } from "@/lib/api/auth";
import { createClient } from "@/utils/supabase/server";
import {
  AttendancePayloadSchema,
  NotePayloadSchema,
  ProgressPayloadSchema,
} from "@/lib/schemas/command";
import { normalizeMarkingSchema, statusAllowedForSchema } from "@/lib/progress/marking-schemas";

const OutboundCommandSchema = z.object({
  client_id: z.string().min(1).max(100),
  classroom_id: z.string().uuid(),
  source: z.enum(["voice", "photo", "text"]),
  raw_transcript: z.string().nullable(),
  command_type: z.enum(["attendance", "progress", "note"]),
  payload: z.unknown(),
  created_at: z.string(),
  approved_at: z.string(),
});

const BatchSchema = z.object({
  commands: z.array(OutboundCommandSchema).min(1).max(50),
});

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = BatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid batch", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Validate each payload by command_type. Reject the whole batch on first failure.
  for (const cmd of parsed.data.commands) {
    const schema =
      cmd.command_type === "attendance"
        ? AttendancePayloadSchema
        : cmd.command_type === "progress"
          ? ProgressPayloadSchema
          : NotePayloadSchema;
    const ok = schema.safeParse(cmd.payload);
    if (!ok.success) {
      return NextResponse.json(
        { error: "Invalid payload", clientId: cmd.client_id, details: ok.error.flatten() },
        { status: 400 }
      );
    }
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const progressCommands = parsed.data.commands.flatMap((command) => {
    if (command.command_type !== "progress") return [];
    const payload = ProgressPayloadSchema.parse(command.payload);
    return [{ command, payload }];
  });
  if (progressCommands.length > 0) {
    const subtopicIds = [...new Set(progressCommands.map(({ payload }) => payload.subtopic_id))];
    const classroomIds = [...new Set(progressCommands.map(({ command }) => command.classroom_id))];
    const [{ data: subtopics }, { data: classrooms }] = await Promise.all([
      supabase
        .from("curriculum_subtopics")
        .select("id, curriculum_topics!inner(curriculum_id, marking_schema)")
        .in("id", subtopicIds),
      supabase.from("classrooms").select("id, curriculum_id").in("id", classroomIds),
    ]);
    const classroomCurriculum = new Map(
      (classrooms ?? []).map((room) => [room.id as string, room.curriculum_id as string | null])
    );
    const topicBySubtopic = new Map(
      (subtopics ?? []).map((subtopic) => {
        const joined = subtopic.curriculum_topics as
          | { curriculum_id: string; marking_schema: string }
          | Array<{ curriculum_id: string; marking_schema: string }>;
        return [subtopic.id as string, Array.isArray(joined) ? joined[0] : joined] as const;
      })
    );
    const invalid = progressCommands.find(({ command, payload }) => {
      const topic = topicBySubtopic.get(payload.subtopic_id);
      return (
        !topic ||
        topic.curriculum_id !== classroomCurriculum.get(command.classroom_id) ||
        !statusAllowedForSchema(payload.status, normalizeMarkingSchema(topic.marking_schema))
      );
    });
    if (invalid) {
      return NextResponse.json(
        {
          error: "Progress value does not match the topic marking schema",
          clientId: invalid.command.client_id,
        },
        { status: 400 }
      );
    }
  }

  // Insert via the user-scoped client so RLS enforces classroom assignment.
  const rows = parsed.data.commands.map((c) => ({
    client_id: c.client_id,
    school_id: auth.user.schoolId,
    user_id: auth.user.userId,
    classroom_id: c.classroom_id,
    source: c.source,
    raw_transcript: c.raw_transcript,
    command_type: c.command_type,
    payload: c.payload,
    created_at: c.created_at,
    approved_at: c.approved_at,
  }));

  // Use upsert with ignoreDuplicates so re-sending the same client_id is a no-op.
  const { data, error } = await supabase
    .from("commands")
    .upsert(rows, { onConflict: "client_id", ignoreDuplicates: true })
    .select("client_id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // `data` lists only the newly inserted rows. For idempotency we ack ALL the
  // client_ids in the batch (the dupes are already on the server).
  const synced = parsed.data.commands.map((c) => c.client_id);

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "sync_commands",
    target_table: "commands",
    metadata: {
      batch_size: rows.length,
      newly_inserted: data?.length ?? 0,
    },
  });

  return NextResponse.json({ synced });
}
