import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireUser, requireReportAccess } from "@/lib/api/auth";
import { ChatMessageActionSchema } from "@/lib/schemas/report-chat";
import { auditLog } from "@/lib/audit/log";

export const runtime = "nodejs";

/**
 * Records an editorial action on a proposal/ghost-edit message:
 *   - `applied`    → set applied_at + applied_to (before/after snapshot)
 *   - `dismissed`  → set dismissed_at
 *   - `regenerated`→ leave applied/dismissed alone, just audit-log it
 *
 * The actual report mutation happens client-side via the existing onChange/
 * PATCH path. This endpoint is the audit-trail half: it pins which
 * suggestions the teacher kept vs. dropped.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; messageId: string }> }
) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id, messageId } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const parsed = ChatMessageActionSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

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

  const { data: message } = await supabase
    .from("report_chat_messages")
    .select("id, kind, report_id, applied_at, dismissed_at")
    .eq("id", messageId)
    .eq("report_id", id)
    .maybeSingle();
  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }
  if (message.kind !== "proposal" && message.kind !== "ghost-edit") {
    return NextResponse.json(
      { error: "Action only valid on proposal or ghost-edit messages" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {};
  if (parsed.data.action === "applied") {
    updates.applied_at = now;
    if (parsed.data.appliedTo) updates.applied_to = parsed.data.appliedTo;
  } else if (parsed.data.action === "dismissed") {
    updates.dismissed_at = now;
  }

  if (Object.keys(updates).length > 0) {
    const { error: updErr } = await supabase
      .from("report_chat_messages")
      .update(updates)
      .eq("id", messageId);
    if (updErr) {
      return NextResponse.json(
        { error: "Failed to update message", message: updErr.message },
        { status: 500 }
      );
    }
  }

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: `report.chat_proposal_${parsed.data.action}`,
    target_table: "report_chat_messages",
    target_id: messageId,
    metadata: {
      report_id: id,
      message_kind: message.kind,
      ...(parsed.data.appliedTo
        ? {
            section_id: parsed.data.appliedTo.sectionId,
            paragraph_id: parsed.data.appliedTo.paragraphId,
          }
        : {}),
    },
  });

  return NextResponse.json({
    ok: true,
    appliedAt: parsed.data.action === "applied" ? now : null,
    dismissedAt: parsed.data.action === "dismissed" ? now : null,
  });
}
