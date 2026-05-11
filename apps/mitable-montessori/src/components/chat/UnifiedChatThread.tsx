"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getDb } from "@/lib/db/schema";
import type { DetokenizedToolCall } from "@/lib/tokenize/detokenize";
import type { ChatProposalRow } from "@/lib/db/types";
import type { CaptureMode } from "@/lib/capture/types";
import type { ResolvedEntity } from "@/lib/schemas/agent-chat";
import { ProposalCard } from "@/components/chat/ProposalCard";
import { Composer, type ComposerEmit } from "@/components/chat/Composer";
import { Bubble, type AgentBubbleMessage } from "@/components/chat/AgentBubble";

/**
 * Unified chat surface. Every input runs through `parseAndStageProposals`
 * (deterministic on-device intent → Haiku fallback). If that produces
 * actionable proposals (attendance, progress, note), they render as
 * `ProposalCard`s. If it produces nothing actionable — empty, or only a
 * clarification — we fall through to `/api/agent/chat` and render a
 * conversational reply.
 *
 * Replaces the older split between `ChatThread` (proposal-only) and
 * `AgentThread` (conversational-only).
 */

export interface UnifiedChatThreadProps {
  threadId: string;
  classroomId: string;
  schoolId: string;
  userId: string;
}

interface UserMessage {
  id: string;
  text: string;
  rawTranscript: string;
  mode: CaptureMode;
  createdAt: string;
}

interface AgentReply extends AgentBubbleMessage {
  createdAt: string;
}

type ThreadEntry =
  | { kind: "user-message"; id: string; createdAt: string; user: UserMessage }
  | { kind: "proposal"; id: string; createdAt: string; proposal: ChatProposalRow }
  | { kind: "agent-reply"; id: string; createdAt: string; reply: AgentReply };

export function UnifiedChatThread(props: UnifiedChatThreadProps) {
  const router = useRouter();

  const proposals =
    useLiveQuery(
      () => getDb().chatProposals.where("threadId").equals(props.threadId).sortBy("createdAt"),
      [props.threadId],
      [] as ChatProposalRow[]
    ) ?? [];

  const [userMessages, setUserMessages] = useState<UserMessage[]>([]);
  const [agentReplies, setAgentReplies] = useState<AgentReply[]>([]);
  const [agentThreadId, setAgentThreadId] = useState<string | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);

  // Merge user messages, proposals, and agent replies chronologically.
  const entries: ThreadEntry[] = [
    ...userMessages.map<ThreadEntry>((m) => ({
      kind: "user-message",
      id: m.id,
      createdAt: m.createdAt,
      user: m,
    })),
    ...proposals.map<ThreadEntry>((p) => ({
      kind: "proposal",
      id: p.id,
      createdAt: p.createdAt,
      proposal: p,
    })),
    ...agentReplies.map<ThreadEntry>((r) => ({
      kind: "agent-reply",
      id: r.id,
      createdAt: r.createdAt,
      reply: r,
    })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Map proposalId → its raw transcript + capture mode for apply context.
  const transcriptByProposalId = new Map<string, string>();
  const modeByProposalId = new Map<string, CaptureMode>();
  let lastTranscript = "";
  let lastMode: CaptureMode = "text";
  for (const e of entries) {
    if (e.kind === "user-message") {
      lastTranscript = e.user.rawTranscript;
      lastMode = e.user.mode;
    } else if (e.kind === "proposal") {
      transcriptByProposalId.set(e.proposal.id, lastTranscript);
      modeByProposalId.set(e.proposal.id, lastMode);
    }
  }

  useEffect(() => {
    // Auto-scroll: handled implicitly by ScrollArea overflow.
  }, [entries.length]);

  async function postToAgent(rawText: string) {
    const pendingId = `agent-pending-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    setAgentReplies((prev) => [
      ...prev,
      {
        id: pendingId,
        role: "assistant",
        text: "…",
        entities: [],
        pending: true,
        createdAt: now,
      },
    ]);
    setAgentError(null);
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          threadId: agentThreadId ?? undefined,
          message: rawText,
        }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as {
        threadId: string;
        message: string;
        entities: ResolvedEntity[];
      };
      setAgentThreadId(json.threadId);
      setAgentReplies((prev) =>
        prev.map((r) =>
          r.id === pendingId
            ? {
                id: `${pendingId}-reply`,
                role: "assistant",
                text: json.message,
                entities: json.entities,
                createdAt: r.createdAt,
              }
            : r
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setAgentError(message);
      setAgentReplies((prev) => prev.filter((r) => r.id !== pendingId));
    }
  }

  function handleEmit(emit: ComposerEmit) {
    const prefix = emit.mode === "voice" ? "🎤 " : emit.mode === "photo" ? "📷 " : "";
    const userId = crypto.randomUUID();
    setUserMessages((prev) => [
      ...prev,
      {
        id: userId,
        text: prefix + emit.message,
        rawTranscript: emit.message,
        mode: emit.mode,
        createdAt: new Date().toISOString(),
      },
    ]);

    // Routing rule: if any proposal is actionable (not a clarification),
    // the proposal pipeline owns this turn. Otherwise fall through to the
    // conversational agent. Voice/photo always rely on the proposal path —
    // we don't want transcribed speech to silently round-trip to an LLM.
    const actionable = emit.proposals.filter((p) => p.call.kind !== "clarification");
    if (actionable.length > 0 || emit.mode !== "text") return;

    void postToAgent(emit.message);
  }

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1 px-3 py-2">
        {entries.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-ink/50">
            Capture an observation (&ldquo;Mark Ada present&rdquo;) or ask about a student
            (&ldquo;How is Ada doing this week?&rdquo;).
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {entries.map((e) => {
              if (e.kind === "user-message") {
                return (
                  <div
                    key={e.id}
                    className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-ink/5 px-3 py-2 text-sm"
                  >
                    {e.user.text}
                  </div>
                );
              }
              if (e.kind === "proposal") {
                return (
                  <ProposalCard
                    key={e.proposal.id}
                    proposalId={e.proposal.id}
                    call={e.proposal.resolvedPayload as unknown as DetokenizedToolCall}
                    display={e.proposal.display}
                    schoolId={props.schoolId}
                    userId={props.userId}
                    classroomId={props.classroomId}
                    rawTranscript={transcriptByProposalId.get(e.proposal.id) ?? null}
                    initialStatus={e.proposal.status}
                    source={modeByProposalId.get(e.proposal.id) ?? "text"}
                  />
                );
              }
              return (
                <Bubble
                  key={e.reply.id}
                  message={e.reply}
                  onChipClick={(id) => router.push(`/app/students/${id}`)}
                />
              );
            })}
            {agentError ? <p className="text-xs text-red-700">{agentError}</p> : null}
          </div>
        )}
      </ScrollArea>
      <Composer
        threadId={props.threadId}
        classroomId={props.classroomId}
        onProposals={handleEmit}
      />
    </div>
  );
}
