"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import type { ResolvedEntity } from "@/lib/schemas/agent-chat";
import { Bubble, type AgentBubbleMessage } from "@/components/chat/AgentBubble";

/**
 * Multi-turn conversational UI for the general chat agent. Sends to
 * `POST /api/agent/chat` and renders the reply with name-chips wrapped in
 * the right offsets from the response's `entities` array. The chips link
 * to the child detail page so the teacher can pivot from "what does the
 * agent see" to "let me look at the actual record".
 *
 * This component is intentionally lean — capture-flow tooling lives in the
 * old `ChatThread` (still used elsewhere for the proposal pipeline).
 */

export interface AgentThreadProps {
  classroomId: string;
  classroomName: string;
  schoolId: string;
  userId: string;
}

type UIMessage = AgentBubbleMessage;

export function AgentThread(props: AgentThreadProps) {
  const router = useRouter();
  const [messages, setMessages] = React.useState<UIMessage[]>([]);
  const [threadId, setThreadId] = React.useState<string | null>(null);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    const userId = `local-${crypto.randomUUID()}`;
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", text: trimmed, entities: [] },
      { id: `${userId}-pending`, role: "assistant", text: "…", entities: [], pending: true },
    ]);
    setInput("");
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId: threadId ?? undefined, message: trimmed }),
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
      setThreadId(json.threadId);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === `${userId}-pending`
            ? {
                id: `${userId}-reply`,
                role: "assistant",
                text: json.message,
                entities: json.entities,
              }
            : m
        )
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong.";
      setError(message);
      setMessages((prev) => prev.filter((m) => m.id !== `${userId}-pending`));
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              padding: "32px 8px",
              textAlign: "center",
              fontSize: 13,
              color: "var(--color-ink-muted)",
              lineHeight: 1.5,
            }}
          >
            Ask about how a student is doing — &ldquo;How is Amelia in practical life this
            week?&rdquo; — and I&rsquo;ll pull the relevant observations.
          </div>
        ) : (
          messages.map((m) => (
            <Bubble
              key={m.id}
              message={m}
              onChipClick={(id) => router.push(`/app/students/${id}`)}
            />
          ))
        )}
      </div>
      <div
        style={{
          borderTop: "1px solid var(--color-border)",
          padding: "10px 12px",
          background: "var(--color-surface)",
        }}
      >
        {error ? (
          <div style={{ fontSize: 11, color: "var(--color-terracotta-deep)", marginBottom: 6 }}>
            {error}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={`Ask about ${props.classroomName}…`}
            rows={1}
            disabled={sending}
            style={{
              flex: 1,
              resize: "none",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              padding: "8px 12px",
              fontSize: 14,
              lineHeight: 1.4,
              background: "var(--color-canvas)",
              color: "var(--color-ink)",
              fontFamily: "inherit",
              minHeight: 36,
              maxHeight: 140,
            }}
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending || input.trim().length === 0}
            className="tap"
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              background: sending ? "var(--color-border)" : "var(--color-terracotta-deep)",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              cursor: sending ? "default" : "pointer",
              flexShrink: 0,
            }}
            aria-label="Send"
          >
            <Send size={14} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </div>
  );
}
