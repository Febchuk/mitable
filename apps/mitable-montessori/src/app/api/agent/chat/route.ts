import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireUser } from "@/lib/api/auth";
import { getActiveClassroomForCurrentUser } from "@/lib/app/active-classroom";
import { getAnthropic, SONNET_MODEL } from "@/lib/anthropic/client";
import { ChatRequestSchema, type ChatResponse } from "@/lib/schemas/agent-chat";
import { loadClassroomRoster } from "@/lib/agent/roster";
import { resolveMentions } from "@/lib/agent/resolve-mentions";
import { runAgentLoop, AgentAbortError, type AgentHistoryTurn } from "@/lib/agent/agent-loop";
import { snapshotTokenMap, tokenMapFromSnapshot, detokenize } from "@/lib/tokens/token-map";
import type { TokenRef } from "@/lib/tokens/types";
import { auditLog } from "@/lib/audit/log";

export const runtime = "nodejs";

/**
 * General-purpose chat agent. Multi-turn dialogue scoped to the teacher's
 * active classroom roster. Names never leave the server: the user message
 * is redacted to `{{student:UUID}}` tokens before any LLM call, and the
 * model's reply is detokenized only at the response boundary.
 *
 * Key invariants:
 *
 *   1. Every persisted message body is tokenized. The detokenized form
 *      lives only in the HTTP response, never in DB rows or logs.
 *   2. The token map is per-request, in-memory only. A snapshot is
 *      persisted alongside each message so the row can render correctly
 *      even if a student is later renamed.
 *   3. Only the user's active classroom roster is in scope. Tools refuse
 *      out-of-scope studentIds.
 */

interface MessageRow {
  id: string;
  role: "user" | "assistant";
  body_tokenized: string;
  token_map_snapshot: TokenRef[];
  created_at: string;
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const classroom = await getActiveClassroomForCurrentUser();
  if (!classroom) {
    return NextResponse.json(
      { error: "No active classroom — assign yourself to a classroom first." },
      { status: 403 }
    );
  }

  const supabase = createAdminClient();

  // 1. Roster + entity resolution -------------------------------------------
  const roster = await loadClassroomRoster({
    classroomId: classroom.id,
    schoolId: auth.user.schoolId,
  });
  const resolved = resolveMentions({
    message: parsed.data.message,
    roster,
    inboundMentions: parsed.data.mentions,
  });

  // 2. Thread bookkeeping ----------------------------------------------------
  let threadId = parsed.data.threadId;
  if (!threadId) {
    const { data: thread, error: threadErr } = await supabase
      .from("agent_chat_threads")
      .insert({
        school_id: auth.user.schoolId,
        classroom_id: classroom.id,
        created_by_user_id: auth.user.userId,
      })
      .select("id")
      .single();
    if (threadErr || !thread) {
      return NextResponse.json(
        { error: "Failed to create thread", message: threadErr?.message },
        { status: 500 }
      );
    }
    threadId = thread.id as string;
  } else {
    // Confirm the thread belongs to this user (or an admin in their school).
    const { data: thread } = await supabase
      .from("agent_chat_threads")
      .select("id, school_id, created_by_user_id")
      .eq("id", threadId)
      .maybeSingle();
    const t = thread as { id: string; school_id: string; created_by_user_id: string } | null;
    if (!t) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }
    const ok =
      t.created_by_user_id === auth.user.userId ||
      (auth.user.role === "admin" && t.school_id === auth.user.schoolId);
    if (!ok) {
      return NextResponse.json({ error: "Not authorized for this thread" }, { status: 403 });
    }
  }

  // 3. Persist the user message FIRST so a downstream LLM failure doesn't
  // lose the teacher's text. Persisted form is tokenized.
  const { data: userRow, error: userErr } = await supabase
    .from("agent_chat_messages")
    .insert({
      thread_id: threadId,
      role: "user",
      body_tokenized: resolved.rewrittenMessage,
      token_map_snapshot: resolved.refs,
    })
    .select("id, role, body_tokenized, token_map_snapshot, created_at")
    .single();
  if (userErr || !userRow) {
    return NextResponse.json(
      { error: "Failed to persist user message", message: userErr?.message },
      { status: 500 }
    );
  }

  // 4. Load history (tokenized) and re-base each message's tokens against
  // the live tokenMap so the model sees a consistent grammar across turns.
  const { data: historyRows } = await supabase
    .from("agent_chat_messages")
    .select("id, role, body_tokenized, token_map_snapshot, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(20);
  const historyExceptCurrent = ((historyRows ?? []) as MessageRow[]).filter(
    (r) => r.id !== userRow.id
  );
  // Augment the live tokenMap with anyone we've referenced in this thread
  // before, so the model can still resolve them this turn.
  for (const row of historyExceptCurrent) {
    for (const ref of row.token_map_snapshot ?? []) {
      const key = ref.token.toLowerCase();
      if (!resolved.tokenMap.reverse.has(key)) {
        resolved.tokenMap.reverse.set(key, ref);
        resolved.tokenMap.forward.set(ref.display.trim().toLowerCase(), ref.token);
        resolved.refs.push(ref);
      }
    }
  }
  const history: AgentHistoryTurn[] = historyExceptCurrent.map((r) => ({
    role: r.role,
    body: r.body_tokenized,
  }));

  // 5. Run the agent loop ---------------------------------------------------
  const startedAt = Date.now();
  let assistantBody = "";
  let assistantBodyTokenized = "";
  let assistantEntities: Awaited<ReturnType<typeof detokenize>>["entities"] = [];
  let toolTrace: Record<string, unknown> = {};
  let aborted = false;
  let abortReason: string | null = null;

  try {
    const result = await runAgentLoop({
      anthropic: getAnthropic(),
      model: SONNET_MODEL,
      history,
      userMessageTokenized: resolved.rewrittenMessage,
      tokenMap: resolved.tokenMap,
      refs: resolved.refs,
      roster,
    });
    assistantBody = result.body;
    assistantBodyTokenized = result.bodyTokenized;
    assistantEntities = result.entities;
    toolTrace = {
      turns: result.turns,
      regenerations: result.regenerations,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      cache_creation_input_tokens: result.cacheCreationInputTokens,
      cache_read_input_tokens: result.cacheReadInputTokens,
    };
  } catch (err) {
    if (err instanceof AgentAbortError) {
      aborted = true;
      abortReason = err.reason;
      assistantBody =
        err.reason === "validation_failed"
          ? "I had trouble keeping privacy tokens straight — could you restate that?"
          : err.reason === "max_turns"
            ? "I'm having trouble responding to that — could you rephrase?"
            : "I couldn't produce a reply for that turn — could you try again?";
      assistantBodyTokenized = assistantBody;
      assistantEntities = [];
      toolTrace = { aborted: true, reason: err.reason, message: err.message };
    } else {
      return NextResponse.json(
        { error: "Anthropic call failed", message: (err as Error).message },
        { status: 502 }
      );
    }
  }

  // 6. Persist the assistant reply (tokenized).
  // We snapshot the tokenMap as it stood when the model emitted the body —
  // tools may have augmented it, so this is a superset of `resolved.refs`.
  const snapshot = snapshotTokenMap(resolved.tokenMap);
  const { error: assistantErr } = await supabase.from("agent_chat_messages").insert({
    thread_id: threadId,
    role: "assistant",
    body_tokenized: assistantBodyTokenized,
    token_map_snapshot: snapshot,
    tool_trace: toolTrace,
  });
  if (assistantErr) {
    // Log only — we still want to return the response so the user sees it.
    console.error("[agent/chat] failed to persist assistant message", assistantErr);
  }

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "agent.chat_turn",
    target_table: "agent_chat_threads",
    target_id: threadId,
    metadata: {
      latency_ms: Date.now() - startedAt,
      thread_message_count: historyExceptCurrent.length + 2,
      classroom_id: classroom.id,
      ambiguities_count: resolved.ambiguities.length,
      aborted,
      abort_reason: abortReason,
      ...toolTrace,
    },
  });

  // If we already detokenized inside the loop we can use those entities;
  // for the abort path, run detokenize so the response shape stays uniform.
  if (aborted) {
    const det = detokenize(assistantBodyTokenized, resolved.tokenMap);
    assistantBody = det.text;
    assistantEntities = det.entities;
  }

  const response: ChatResponse = {
    threadId,
    message: assistantBody,
    entities: assistantEntities,
    ...(resolved.ambiguities.length > 0 ? { ambiguities: resolved.ambiguities } : {}),
  };
  return NextResponse.json(response);
}

/**
 * GET — list messages on a thread (used by the UI to seed the conversation
 * on reload). Returns detokenized body + entities so the client can render
 * names without holding the snapshots itself.
 */
export async function GET(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const url = new URL(req.url);
  const threadId = url.searchParams.get("threadId");
  if (!threadId) {
    return NextResponse.json({ error: "threadId required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: thread } = await supabase
    .from("agent_chat_threads")
    .select("id, school_id, created_by_user_id")
    .eq("id", threadId)
    .maybeSingle();
  const t = thread as { id: string; school_id: string; created_by_user_id: string } | null;
  if (!t) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  const ok =
    t.created_by_user_id === auth.user.userId ||
    (auth.user.role === "admin" && t.school_id === auth.user.schoolId);
  if (!ok) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { data: rows } = await supabase
    .from("agent_chat_messages")
    .select("id, role, body_tokenized, token_map_snapshot, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  const messages = ((rows ?? []) as MessageRow[]).map((r) => {
    const map = tokenMapFromSnapshot(r.token_map_snapshot ?? []);
    const det = detokenize(r.body_tokenized, map);
    return {
      id: r.id,
      role: r.role,
      message: det.text,
      entities: det.entities,
      createdAt: r.created_at,
    };
  });

  return NextResponse.json({ threadId, messages });
}
