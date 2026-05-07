import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireUser, requireReportAccess } from "@/lib/api/auth";
import { getAnthropic, SONNET_MODEL } from "@/lib/anthropic/client";
import { ChatTurnRequestSchema, type ChatTurnMessage } from "@/lib/schemas/report-chat";
import {
  runReportChatAgent,
  ChatAgentAbortError,
  type ChatHistoryTurn,
  type ChatTokenizedSection,
} from "@/lib/reports/chat-agent-loop";
import type { ReportReferenceSet } from "@/lib/reports/data-adapter";
import { rowToChatMessage, type StoredChatRow } from "@/lib/reports/chat-message";
import { auditLog } from "@/lib/audit/log";

export const runtime = "nodejs";

/**
 * Phase 3: runs the bounded chat agent loop. Read tool: read_report_sections.
 * Terminal tools: propose_rewrite (structured paragraph rewrite),
 * propose_prose_reply, ask_clarifying_question. Persists the user message
 * and the assistant's reply to report_chat_messages with full tokenization
 * parity (agent reasons in tokens; payload stored detokenized with the
 * references snapshot used).
 */

type ReportSection = {
  id: string;
  heading: string;
  paragraphs: { id: string; html: string }[];
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const parsed = ChatTurnRequestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { data: report, error: readErr } = await supabase
    .from("reports")
    .select(
      "id, classroom_id, student_id, title, sections, students!inner(school_id, first_name, last_name, preferred_name)"
    )
    .eq("id", id)
    .maybeSingle();
  if (readErr || !report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const studentRow = (
    report as unknown as {
      students: {
        school_id: string;
        first_name: string | null;
        last_name: string | null;
        preferred_name: string | null;
      } | null;
    }
  ).students;
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

  // Build the reference set for this turn. Phase 2 covers active student +
  // classroom. Subtopics ship with the read tool that surfaces them in
  // Phase 4. The validator only checks the names we declare here.
  const studentDisplay = (studentRow?.preferred_name || studentRow?.first_name || "Student").trim();
  const classroomDisplay = await fetchClassroomName(supabase, report.classroom_id as string);

  const references: ReportReferenceSet = {
    refs: [
      {
        id: report.student_id as string,
        token: "[STUDENT_1]",
        display: studentDisplay,
        kind: "student",
      },
      {
        id: report.classroom_id as string,
        token: "[CLASSROOM_0]",
        display: classroomDisplay || "this classroom",
        kind: "classroom",
      },
    ],
  };

  const sections = (report.sections as ReportSection[] | null) ?? [];
  const tokenizedSections: ChatTokenizedSection[] = sections.map((s) => ({
    id: s.id,
    heading: tokenizeText(s.heading, references),
    paragraphs: s.paragraphs.map((p) => ({
      id: p.id,
      html: tokenizeText(stripHtml(p.html), references),
    })),
  }));
  const tokenizedTitle = tokenizeText((report.title as string | null) ?? "", references);

  // Pull recent history (oldest → newest) so the agent has continuity.
  const { data: historyRows } = await supabase
    .from("report_chat_messages")
    .select("role, kind, payload, target_ref, created_at")
    .eq("report_id", id)
    .order("created_at", { ascending: false })
    .limit(20);
  const history: ChatHistoryTurn[] = (
    (historyRows ?? []) as Array<{
      role: "user" | "assistant";
      kind: string;
      payload: Record<string, unknown> | null;
      target_ref: { sectionId?: string } | null;
    }>
  )
    .reverse()
    .map((r) => {
      // Proposal/ghost-edit payloads are summarized for context (the agent
      // doesn't need full oldText/newText replayed). Prose/clarify/user-text
      // pass through as their body.
      const body =
        r.kind === "proposal"
          ? `(I proposed a rewrite: "${String(r.payload?.lead ?? "")}")`
          : typeof r.payload?.body === "string"
            ? (r.payload.body as string)
            : "";
      return {
        role: r.role,
        body,
        targetHint: r.target_ref?.sectionId
          ? sectionHeadingForId(sections, r.target_ref.sectionId)
          : undefined,
      };
    })
    .filter((h) => h.body.length > 0);

  const targetHint = parsed.data.targetRef?.sectionId
    ? sectionHeadingForId(sections, parsed.data.targetRef.sectionId)
    : undefined;

  // Persist the user message first so that even if the agent fails, the
  // teacher's text isn't lost.
  const userMessageRow = await persistMessage(supabase, {
    report_id: id,
    role: "user",
    kind: "user-text",
    payload: { body: parsed.data.userMessage },
    references: references,
    target_ref: parsed.data.targetRef ?? null,
    actor_role: access.actorRole,
    created_by_user_id: auth.user.userId,
  });
  if (!userMessageRow) {
    return NextResponse.json({ error: "Failed to persist message" }, { status: 500 });
  }

  const startedAt = Date.now();
  let assistantMessage: ChatTurnMessage;
  let toolTrace: Record<string, unknown> | null = null;
  try {
    const result = await runReportChatAgent({
      anthropic: getAnthropic(),
      model: SONNET_MODEL,
      tokenizedSections,
      tokenizedTitle,
      references,
      history,
      userMessage: parsed.data.userMessage,
      targetHint,
    });

    let assistantPayload: Record<string, unknown>;
    let assistantToolTrace: Record<string, unknown>;
    if (result.terminalKind === "proposal") {
      const headingDisplay = sectionHeadingForId(sections, result.proposal.target.sectionId);
      assistantPayload = {
        lead: result.proposal.lead,
        target: {
          sectionId: result.proposal.target.sectionId,
          paragraphId: result.proposal.target.paragraphId,
          ...(headingDisplay ? { headingDisplay } : {}),
        },
        oldText: result.proposal.oldText,
        newText: result.proposal.newText,
        ...(result.proposal.rationale ? { rationale: result.proposal.rationale } : {}),
      };
      assistantToolTrace = {
        tokenized: result.proposal.tokenized,
        target: result.proposal.target,
        turns: result.turns,
        regenerations: result.regenerations,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
      };
    } else {
      assistantPayload = { body: result.body };
      assistantToolTrace = {
        tokenized_body: result.tokenizedBody,
        turns: result.turns,
        regenerations: result.regenerations,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
      };
    }

    const assistantRow = await persistMessage(supabase, {
      report_id: id,
      role: "assistant",
      kind: result.terminalKind,
      payload: assistantPayload,
      references: references,
      target_ref: parsed.data.targetRef ?? null,
      actor_role: "assistant",
      created_by_user_id: null,
      tool_trace: assistantToolTrace,
    });
    if (!assistantRow) {
      return NextResponse.json({ error: "Failed to persist assistant message" }, { status: 500 });
    }
    assistantMessage = rowToChatMessage(assistantRow);
    toolTrace = {
      turns: result.turns,
      regenerations: result.regenerations,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      terminal_kind: result.terminalKind,
    };
  } catch (err) {
    if (err instanceof ChatAgentAbortError) {
      // Graceful degradation: persist a synthetic clarify so the user sees
      // something in the thread instead of a 500.
      const fallbackBody =
        err.reason === "validation_failed"
          ? "I had trouble keeping privacy tokens straight on that one — could you restate?"
          : err.reason === "max_turns"
            ? "I'm having trouble responding to that — could you rephrase?"
            : "I couldn't produce a reply for that turn — could you try again?";
      const assistantRow = await persistMessage(supabase, {
        report_id: id,
        role: "assistant",
        kind: "clarify",
        payload: { body: fallbackBody },
        references: references,
        target_ref: parsed.data.targetRef ?? null,
        actor_role: "assistant",
        created_by_user_id: null,
        tool_trace: { aborted: true, reason: err.reason, message: err.message },
      });
      if (!assistantRow) {
        return NextResponse.json(
          { error: "Agent aborted and fallback persistence failed" },
          { status: 500 }
        );
      }
      assistantMessage = rowToChatMessage(assistantRow);
      toolTrace = { aborted: true, reason: err.reason };
    } else {
      return NextResponse.json(
        { error: "Anthropic call failed", message: (err as Error).message },
        { status: 502 }
      );
    }
  }

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "report.chat_turn",
    target_table: "reports",
    target_id: id,
    metadata: {
      latency_ms: Date.now() - startedAt,
      phase: 3,
      ...toolTrace,
    },
  });

  return NextResponse.json({
    messages: [rowToChatMessage(userMessageRow), assistantMessage],
  });
}

// ----- helpers -------------------------------------------------------------

async function persistMessage(
  supabase: ReturnType<typeof createAdminClient>,
  row: {
    report_id: string;
    role: "user" | "assistant";
    kind: string;
    payload: Record<string, unknown>;
    references: ReportReferenceSet;
    target_ref: unknown;
    actor_role: "teacher" | "admin" | "assistant";
    created_by_user_id: string | null;
    tool_trace?: Record<string, unknown>;
  }
): Promise<StoredChatRow | null> {
  const { data, error } = await supabase
    .from("report_chat_messages")
    .insert({
      report_id: row.report_id,
      role: row.role,
      kind: row.kind,
      payload: row.payload,
      references: row.references,
      target_ref: row.target_ref,
      actor_role: row.actor_role,
      created_by_user_id: row.created_by_user_id,
      tool_trace: row.tool_trace ?? null,
    })
    .select("id, role, kind, payload, target_ref, actor_role, applied_at, dismissed_at, created_at")
    .single();
  if (error || !data) {
    console.error("[chat/turn] insert failed", error);
    return null;
  }
  return data as StoredChatRow;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

function tokenizeText(text: string, refs: ReportReferenceSet): string {
  if (!text.trim()) return text;
  const sorted = [...refs.refs]
    .filter((r) => r.display && r.display.trim().length >= 2)
    .sort((a, b) => b.display.length - a.display.length);
  let out = text;
  for (const r of sorted) {
    const escaped = r.display.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "gi");
    out = out.replace(re, r.token);
  }
  return out;
}

function sectionHeadingForId(sections: ReportSection[], id: string): string | undefined {
  return sections.find((s) => s.id === id)?.heading;
}

async function fetchClassroomName(
  supabase: ReturnType<typeof createAdminClient>,
  classroomId: string
): Promise<string> {
  const { data } = await supabase
    .from("classrooms")
    .select("name")
    .eq("id", classroomId)
    .maybeSingle();
  return ((data as { name: string | null } | null)?.name ?? "").trim();
}
