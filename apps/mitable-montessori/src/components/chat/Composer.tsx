"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { tokenizeText } from "@/lib/tokenize/tokenize";
import {
  describeDetokenized,
  detokenizeToolCall,
  type DetokenizedToolCall,
} from "@/lib/tokenize/detokenize";
import type { ParsedToolCall } from "@/lib/schemas/parsed-tool-call";
import { getDb } from "@/lib/db/schema";

export interface ComposerProps {
  threadId: string;
  classroomId: string;
}

export interface ComposerEmit {
  message: string;
  proposals: Array<{
    proposalId: string;
    call: DetokenizedToolCall;
    display: string;
    rawTranscript: string;
  }>;
}

export function Composer(props: ComposerProps & { onProposals: (e: ComposerEmit) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    setDebug(null);
    const raw = text.trim();
    try {
      const tokenized = await tokenizeText(raw);
      setDebug(`tokenized: ${tokenized.tokenizedText}`);
      const todayIso = new Date().toISOString().slice(0, 10);
      const res = await fetch("/api/v1/ai/parse-command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tokenizedText: tokenized.tokenizedText,
          references: tokenized.references.map((r) => ({
            token: r.token,
            ref: r.id,
            kind: r.kind,
          })),
          classroomId: props.classroomId,
          todayIso,
        }),
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`parse-command failed: ${res.status} ${await res.text()}`);
      }
      const json = (await res.json()) as { toolCalls: ParsedToolCall[] };
      const db = getDb();
      const now = new Date().toISOString();
      const proposals = [];
      for (const call of json.toolCalls ?? []) {
        const detok = detokenizeToolCall(call, tokenized.references, props.classroomId);
        if (!detok) continue;
        const display = describeDetokenized(detok);
        const proposalId = crypto.randomUUID();
        await db.chatProposals.add({
          id: proposalId,
          threadId: props.threadId,
          createdAt: now,
          status: "proposed",
          toolName: call.tool,
          tokenizedPayload: call.args as Record<string, unknown>,
          resolvedPayload: detok as unknown as Record<string, unknown>,
          display,
        });
        proposals.push({ proposalId, call: detok, display, rawTranscript: raw });
      }
      props.onProposals({ message: raw, proposals });
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 border-t border-ink/10 p-3">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="Type a quick observation… e.g. 'Mark Lina present and pink tower practicing'"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
          }
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-ink/40">
          {debug ?? "Tokenized client-side before any LLM call. ⌘/Ctrl+Enter to send."}
        </p>
        <Button type="submit" size="sm" disabled={busy || !text.trim()}>
          <Send className="h-4 w-4" />
          {busy ? "Parsing…" : "Send"}
        </Button>
      </div>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </form>
  );
}
