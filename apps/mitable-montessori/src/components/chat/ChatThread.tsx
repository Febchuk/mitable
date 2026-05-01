"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getDb } from "@/lib/db/schema";
import type { DetokenizedToolCall } from "@/lib/tokenize/detokenize";
import type { ChatProposalRow } from "@/lib/db/types";
import { ProposalCard } from "@/components/chat/ProposalCard";
import { Composer } from "@/components/chat/Composer";

export interface ChatThreadProps {
  threadId: string;
  classroomId: string;
  schoolId: string;
  userId: string;
}

interface ThreadEntry {
  kind: "user-message" | "proposal";
  id: string;
  createdAt: string;
  text?: string;
  proposal?: ChatProposalRow;
  rawTranscript?: string;
}

export function ChatThread(props: ChatThreadProps) {
  const proposals =
    useLiveQuery(
      () => getDb().chatProposals.where("threadId").equals(props.threadId).sortBy("createdAt"),
      [props.threadId],
      [] as ChatProposalRow[]
    ) ?? [];

  const [userMessages, setUserMessages] = useState<
    Array<{ id: string; text: string; createdAt: string; rawTranscript: string }>
  >([]);

  // Merge user messages and proposals chronologically.
  const entries: ThreadEntry[] = [
    ...userMessages.map<ThreadEntry>((m) => ({
      kind: "user-message",
      id: m.id,
      createdAt: m.createdAt,
      text: m.text,
      rawTranscript: m.rawTranscript,
    })),
    ...proposals.map<ThreadEntry>((p) => ({
      kind: "proposal",
      id: p.id,
      createdAt: p.createdAt,
      proposal: p,
    })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Map proposalId → its raw transcript for the apply context.
  const transcriptByProposalId = new Map<string, string>();
  // We assume the most-recent user message before each proposal owns it.
  let lastTranscript = "";
  for (const e of entries) {
    if (e.kind === "user-message") lastTranscript = e.rawTranscript ?? "";
    else if (e.proposal) transcriptByProposalId.set(e.proposal.id, lastTranscript);
  }

  useEffect(() => {
    // Auto-scroll: handled implicitly by ScrollArea overflow.
  }, [entries.length]);

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1 px-3 py-2">
        {entries.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-ink/50">
            Start by typing what just happened in the classroom.
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
                    {e.text}
                  </div>
                );
              }
              if (!e.proposal) return null;
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
                />
              );
            })}
          </div>
        )}
      </ScrollArea>
      <Composer
        threadId={props.threadId}
        classroomId={props.classroomId}
        onProposals={(emit) => {
          setUserMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              text: emit.message,
              createdAt: new Date().toISOString(),
              rawTranscript: emit.message,
            },
          ]);
        }}
      />
    </div>
  );
}
