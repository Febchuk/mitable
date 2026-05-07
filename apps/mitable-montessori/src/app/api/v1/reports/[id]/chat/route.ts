import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireUser, requireReportAccess } from "@/lib/api/auth";
import type { ChatTurnMessage } from "@/lib/schemas/report-chat";

export const runtime = "nodejs";

/**
 * Returns the persisted thread for a report (oldest first). Used by the
 * client to seed the chat pane on mount.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const supabase = createAdminClient();
  const { data: report, error: readErr } = await supabase
    .from("reports")
    .select("id, classroom_id, students!inner(school_id)")
    .eq("id", id)
    .maybeSingle();
  if (readErr || !report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const studentRow = (report as unknown as { students: { school_id: string } | null }).students;
  if (studentRow?.school_id !== auth.user.schoolId) {
    return NextResponse.json({ error: "Not in your school" }, { status: 403 });
  }

  const access = await requireReportAccess({
    user: auth.user,
    classroomId: report.classroom_id as string,
  });
  if (!access.ok) {
    return NextResponse.json({ error: "Not authorized for this report" }, { status: 403 });
  }

  const { data: rows, error } = await supabase
    .from("report_chat_messages")
    .select("id, role, kind, payload, target_ref, actor_role, created_at")
    .eq("report_id", id)
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json(
      { error: "Failed to load thread", message: error.message },
      { status: 500 }
    );
  }

  const messages: ChatTurnMessage[] = (
    (rows ?? []) as Array<{
      id: string;
      role: string;
      kind: string;
      payload: { body?: string } | null;
      target_ref: unknown;
      actor_role: "teacher" | "admin" | "assistant";
      created_at: string;
    }>
  )
    .filter((r) => typeof r.payload?.body === "string")
    .map((r) => ({
      kind: r.kind as ChatTurnMessage["kind"],
      id: r.id,
      body: r.payload!.body as string,
      createdAt: r.created_at,
      actorRole: r.actor_role,
      targetRef: (r.target_ref as ChatTurnMessage["targetRef"]) ?? undefined,
    }));

  return NextResponse.json({ messages });
}
