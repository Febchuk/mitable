import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireUser, requireReportAccess } from "@/lib/api/auth";
import { getAnthropic, SONNET_MODEL } from "@/lib/anthropic/client";
import { ChatTurnRequestSchema, type ChatTurnMessage } from "@/lib/schemas/report-chat";
import {
  runReportChatAgent,
  ChatAgentAbortError,
  type ChatHistoryTurn,
  type ChatTokenizedArtifact,
  type ChatTokenizedSection,
  type SearchArtifactsFn,
} from "@/lib/reports/chat-agent-loop";
import type { ReportReferenceSet } from "@/lib/reports/data-adapter";
import { rowToChatMessage, type StoredChatRow } from "@/lib/reports/chat-message";
import { auditLog } from "@/lib/audit/log";
import { fieldPayloadToReadableText } from "@/lib/reports/template-field-payload";
import type { SectionMeta } from "@/lib/report-templates/sections";
import {
  defaultClassroomSectionRole,
  isDefaultClassroomReport,
} from "@/lib/reports/default-classroom-report";

export const runtime = "nodejs";

/**
 * Phase 4: runs the bounded chat agent loop with the full archetype set.
 * Read tools: read_report_sections, search_capture_artifacts. Terminal tools:
 * propose_rewrite, propose_chips, propose_observation_ref, propose_ghost_edit,
 * propose_prose_reply, ask_clarifying_question. Persists the user message and
 * the assistant's reply to report_chat_messages with full tokenization parity.
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
      "id, classroom_id, student_id, title, sections, template_id, section_meta, students!inner(school_id, first_name, last_name, preferred_name)"
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
  //
  // IMPORTANT: never substitute a fallback English-prose display string
  // (e.g. "Student", "this classroom"). The leak validator splits displays
  // into whole-word fragments and forbids each one in the agent's output —
  // a fallback like "this classroom" forbids the word "this" from any
  // reply, breaking benign prose. If the source row has no name, drop the
  // ref entirely; the system prompt's privacy rules still apply.
  const studentDisplay = (studentRow?.preferred_name || studentRow?.first_name || "").trim();
  const classroomDisplay = await fetchClassroomName(supabase, report.classroom_id as string);

  const refs: ReportReferenceSet["refs"] = [];
  if (studentDisplay.length >= 2) {
    refs.push({
      id: report.student_id as string,
      token: "[STUDENT_1]",
      display: studentDisplay,
      kind: "student",
    });
  }
  if (classroomDisplay.length >= 2) {
    refs.push({
      id: report.classroom_id as string,
      token: "[CLASSROOM_0]",
      display: classroomDisplay,
      kind: "classroom",
    });
  }
  const references: ReportReferenceSet = { refs };

  const sections = (report.sections as ReportSection[] | null) ?? [];
  const sectionMeta = (report.section_meta as SectionMeta | null) ?? {};
  const defaultClassroomReport = isDefaultClassroomReport(
    report.template_id as string | null,
    sectionMeta
  );
  const tokenizedSections: ChatTokenizedSection[] = sections.map((s) => ({
    id: s.id,
    heading: tokenizeText(s.heading, references),
    paragraphs: s.paragraphs.map((p) => ({
      id: p.id,
      html: tokenizeText(fieldPayloadToReadableText(p.html), references),
    })),
    ...(defaultClassroomReport
      ? { sectionRole: defaultClassroomSectionRole(s.heading, sectionMeta) }
      : {}),
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
      // Structured payloads are summarized for context (the agent doesn't
      // need full oldText/newText/chips/etc replayed). Prose/clarify/
      // user-text pass through as their body.
      const body = summarizeHistoryRow(r);
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

  // Build the user message context. Attachments append a one-liner so the
  // agent knows there's something to search for; the OCR text + thumbnail
  // already live in report_chat_artifacts (see /chat/artifacts upload).
  const attachments = parsed.data.attachments ?? [];
  const attachmentSuffix = attachments
    .map((a) => {
      const ocr = a.ocrText
        ? ` (OCR snippet: "${a.ocrText.slice(0, 140)}${a.ocrText.length > 140 ? "…" : ""}")`
        : "";
      return `(Attached ${a.kind} artifactId=${a.artifactId}${ocr})`;
    })
    .join("\n");
  const userMessageForAgent = attachmentSuffix
    ? `${parsed.data.userMessage}\n\n${attachmentSuffix}`
    : parsed.data.userMessage;

  // Persist the user message first so that even if the agent fails, the
  // teacher's text isn't lost. Attachments are recorded in the payload so
  // GET /chat can replay them on reload.
  const userMessageRow = await persistMessage(supabase, {
    report_id: id,
    role: "user",
    kind: "user-text",
    payload: {
      body: parsed.data.userMessage,
      ...(attachments.length > 0 ? { attachments } : {}),
    },
    references: references,
    target_ref: parsed.data.targetRef ?? null,
    actor_role: access.actorRole,
    created_by_user_id: auth.user.userId,
  });
  if (!userMessageRow) {
    return NextResponse.json({ error: "Failed to persist message" }, { status: 500 });
  }

  const searchArtifacts: SearchArtifactsFn = async ({ query, limit }) => {
    return searchReportArtifacts(supabase, id, references, query, limit);
  };

  const startedAt = Date.now();
  let assistantMessages: ChatTurnMessage[] = [];
  let toolTrace: Record<string, unknown> | null = null;
  try {
    const result = await runReportChatAgent({
      anthropic: getAnthropic(),
      model: SONNET_MODEL,
      tokenizedSections,
      tokenizedTitle,
      references,
      history,
      userMessage: userMessageForAgent,
      targetHint,
      searchArtifacts,
      defaultClassroomReport,
    });

    const meta = {
      turns: result.turns,
      regenerations: result.regenerations,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      cache_creation_input_tokens: result.cacheCreationInputTokens,
      cache_read_input_tokens: result.cacheReadInputTokens,
    };

    // The agent may emit multiple terminal tool calls in one turn (e.g. one
    // propose_rewrite per paragraph when the teacher asked for edits to
    // several paragraphs). Each emission becomes its own assistant chat row
    // so the UI can render them as independent cards with their own
    // Apply/Skip buttons.
    for (const emission of result.emissions) {
      let assistantPayload: Record<string, unknown>;
      let assistantToolTrace: Record<string, unknown>;
      switch (emission.terminalKind) {
        case "proposal": {
          const headingDisplay = sectionHeadingForId(sections, emission.proposal.target.sectionId);
          assistantPayload = {
            lead: emission.proposal.lead,
            target: {
              sectionId: emission.proposal.target.sectionId,
              paragraphId: emission.proposal.target.paragraphId,
              ...(headingDisplay ? { headingDisplay } : {}),
            },
            oldText: emission.proposal.oldText,
            newText: emission.proposal.newText,
            ...(emission.proposal.rationale ? { rationale: emission.proposal.rationale } : {}),
          };
          assistantToolTrace = {
            tokenized: emission.proposal.tokenized,
            target: emission.proposal.target,
            ...meta,
          };
          break;
        }
        case "chips": {
          assistantPayload = {
            body: emission.chips.body,
            chips: emission.chips.chips,
          };
          assistantToolTrace = { tokenized: emission.chips.tokenized, ...meta };
          break;
        }
        case "obs-ref": {
          assistantPayload = {
            body: emission.obsRef.body,
            obs: emission.obsRef.obs,
            ...(emission.obsRef.suggestedTarget
              ? { suggestedTarget: emission.obsRef.suggestedTarget }
              : {}),
          };
          assistantToolTrace = { tokenized: emission.obsRef.tokenized, ...meta };
          break;
        }
        case "ghost-edit": {
          assistantPayload = {
            body: emission.ghostEdit.body,
            target: emission.ghostEdit.target,
            ghostEdit: emission.ghostEdit.ghostEdit,
          };
          assistantToolTrace = { tokenized: emission.ghostEdit.tokenized, ...meta };
          break;
        }
        case "new-section": {
          assistantPayload = {
            body: emission.newSection.body,
            sectionId: emission.newSection.sectionId,
            heading: emission.newSection.heading,
            paragraphs: emission.newSection.paragraphs,
            ...(emission.newSection.afterSectionId
              ? { afterSectionId: emission.newSection.afterSectionId }
              : {}),
          };
          assistantToolTrace = { tokenized: emission.newSection.tokenized, ...meta };
          break;
        }
        case "prose":
        case "clarify":
        default: {
          assistantPayload = { body: emission.body };
          assistantToolTrace = { tokenized_body: emission.tokenizedBody, ...meta };
          break;
        }
      }

      const assistantRow = await persistMessage(supabase, {
        report_id: id,
        role: "assistant",
        kind: emission.terminalKind,
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
      assistantMessages.push(rowToChatMessage(assistantRow));
    }

    toolTrace = {
      turns: result.turns,
      regenerations: result.regenerations,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      cache_creation_input_tokens: result.cacheCreationInputTokens,
      cache_read_input_tokens: result.cacheReadInputTokens,
      terminal_kinds: result.emissions.map((e) => e.terminalKind),
      emissions_count: result.emissions.length,
      attachments_count: attachments.length,
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
      assistantMessages = [rowToChatMessage(assistantRow)];
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
      phase: 5,
      ...toolTrace,
    },
  });

  return NextResponse.json({
    messages: [rowToChatMessage(userMessageRow), ...assistantMessages],
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

/** Compress a stored row into a one-line summary for replay context. */
function summarizeHistoryRow(r: { kind: string; payload: Record<string, unknown> | null }): string {
  const p = r.payload ?? {};
  switch (r.kind) {
    case "proposal":
      return `(I proposed a rewrite: "${String(p.lead ?? "")}")`;
    case "chips": {
      const labels = Array.isArray(p.chips)
        ? (p.chips as Array<{ label?: string }>)
            .map((c) => c.label)
            .filter(Boolean)
            .join(" / ")
        : "";
      return `(I offered chips: ${labels})`;
    }
    case "obs-ref": {
      const obs = (p.obs ?? {}) as { quote?: string };
      return `(I surfaced an observation: "${String(obs.quote ?? "").slice(0, 120)}")`;
    }
    case "ghost-edit":
      return `(I added an inline suggestion: "${String(p.body ?? "")}")`;
    default:
      return typeof p.body === "string" ? (p.body as string) : "";
  }
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

/**
 * Search this report's chat artifacts. Empty query returns the most recent
 * rows; otherwise uses Postgres ILIKE on ocr_text. Results are tokenized
 * before returning so the agent never sees raw names.
 */
async function searchReportArtifacts(
  supabase: ReturnType<typeof createAdminClient>,
  reportId: string,
  references: ReportReferenceSet,
  query: string,
  limit: number
): Promise<ChatTokenizedArtifact[]> {
  let q = supabase
    .from("report_chat_artifacts")
    .select("id, kind, ocr_text, capture_metadata, created_at")
    .eq("report_id", reportId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (query.length > 0) {
    q = q.ilike("ocr_text", `%${query.replace(/[%_]/g, "")}%`);
  }
  const { data } = await q;
  const rows = (data ?? []) as Array<{
    id: string;
    kind: "photo" | "transcript" | "ocr";
    ocr_text: string | null;
    capture_metadata: { capturedAt?: string; area?: string } | null;
    created_at: string;
  }>;
  return rows.map((r) => {
    const ocr = (r.ocr_text ?? "").trim();
    const quote = ocr.length > 280 ? ocr.slice(0, 277).trimEnd() + "…" : ocr || "(no text)";
    const capturedAt = r.capture_metadata?.capturedAt ?? r.created_at;
    return {
      artifactId: r.id,
      quote: tokenizeText(quote, references),
      when: formatCapturedAt(capturedAt),
      area: r.capture_metadata?.area
        ? tokenizeText(r.capture_metadata.area, references)
        : undefined,
      source: r.kind,
    };
  });
}

function formatCapturedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Format like "10:14 AM" — short, locale-neutral, matches mock copy.
  return d
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .toLowerCase()
    .replace(/(\d)(am|pm)/, "$1 $2")
    .toUpperCase();
}
