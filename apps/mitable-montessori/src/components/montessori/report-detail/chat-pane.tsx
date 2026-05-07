"use client";

import * as React from "react";
import { Clock, Mic, Send } from "lucide-react";
import { ToastBus } from "../primitives";
import { SparkleGlyph } from "./icons";
import type { ChatTurnMessage } from "@/lib/schemas/report-chat";

const COMING_SOON_MIC = "Voice input lands in a later phase — type for now.";
const HISTORY_HIDDEN = "Conversation history will land later — one thread per report for now.";

type ChatMessage = ChatTurnMessage | { kind: "error"; id: string; body: string };

export function ChatPane({ reportId }: { reportId: string }) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [historyLoaded, setHistoryLoaded] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, sending]);

  // Load persisted thread on mount.
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/v1/reports/${reportId}/chat`, {
          credentials: "include",
        });
        if (!res.ok) {
          // Non-fatal: empty thread state is the same as load failure here.
          if (!cancelled) setHistoryLoaded(true);
          return;
        }
        const json = (await res.json()) as { messages: ChatTurnMessage[] };
        if (!cancelled) {
          setMessages(json.messages ?? []);
          setHistoryLoaded(true);
        }
      } catch {
        if (!cancelled) setHistoryLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  const onSend = React.useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    // Optimistic user message — replaced with the server-stamped row when the
    // turn returns. Marked with a "temp-" id so the swap is unambiguous.
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: ChatTurnMessage = {
      kind: "user-text",
      id: tempId,
      body: trimmed,
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch(`/api/v1/reports/${reportId}/chat/turn`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userMessage: trimmed }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== tempId),
          optimistic, // keep the user's text visible — they didn't lose it
          {
            kind: "error",
            id: `e-${crypto.randomUUID()}`,
            body: j.error || "Something went wrong. Try again.",
          },
        ]);
        return;
      }
      const json = (await res.json()) as { messages: ChatTurnMessage[] };
      setMessages((prev) => [...prev.filter((m) => m.id !== tempId), ...json.messages]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          kind: "error",
          id: `e-${crypto.randomUUID()}`,
          body: (err as Error).message || "Network error. Try again.",
        },
      ]);
    } finally {
      setSending(false);
      // Refocus the textarea so the teacher can keep typing.
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [input, reportId, sending]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void onSend();
    }
  };

  return (
    <aside className="rd-pane rd-chat-pane" aria-label="Editing assistant">
      <div className="rd-chat-header">
        <div>
          <div className="rd-chat-title">
            <span className="rd-ai-glyph">
              <SparkleGlyph size={12} />
            </span>
            <span>Editing assistant</span>
          </div>
          <div className="rd-chat-subtitle">
            Discuss edits, pull from today&rsquo;s observations
          </div>
        </div>
        <button
          type="button"
          className="rd-icon-btn"
          title={HISTORY_HIDDEN}
          onClick={() => ToastBus.push({ message: HISTORY_HIDDEN })}
        >
          <Clock size={16} strokeWidth={2} />
        </button>
      </div>

      <div className="rd-chat-scroll scroll-quiet" ref={scrollRef}>
        {historyLoaded && messages.length === 0 ? (
          <EmptyState />
        ) : (
          messages.map((m) => <MessageView key={m.id} message={m} />)
        )}
        {sending ? <ThinkingIndicator /> : null}
      </div>

      <div className="rd-composer-wrap">
        <div className="rd-composer">
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder="Ask the assistant to refine this report…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={sending}
            aria-label="Message the editing assistant"
          />
          <div className="rd-composer-actions">
            <button
              type="button"
              className="rd-icon-btn"
              title={COMING_SOON_MIC}
              onClick={() => ToastBus.push({ message: COMING_SOON_MIC })}
            >
              <Mic size={16} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="rd-icon-btn rd-primary"
              title="Send"
              onClick={() => void onSend()}
              disabled={sending || !input.trim()}
            >
              <Send size={15} strokeWidth={2.5} />
            </button>
          </div>
        </div>
        <div className="rd-composer-hints">
          <span className="rd-kbd">Enter</span>
          <span>send</span>
          <span className="rd-kbd" style={{ marginLeft: 8 }}>
            Shift + Enter
          </span>
          <span>new line</span>
        </div>
      </div>
    </aside>
  );
}

function EmptyState() {
  return (
    <div className="rd-msg rd-msg-ai">
      <div className="rd-avatar">
        <SparkleGlyph size={12} />
      </div>
      <div className="rd-body">
        Ask me to refine this report — for example, &ldquo;make the morning paragraph warmer&rdquo;
        or &ldquo;does anything sound clinical?&rdquo;
      </div>
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="rd-msg rd-msg-ai" aria-live="polite">
      <div className="rd-avatar">
        <SparkleGlyph size={12} />
      </div>
      <div className="rd-body rd-thinking">
        <span className="rd-thinking-dot" />
        <span className="rd-thinking-dot" />
        <span className="rd-thinking-dot" />
      </div>
    </div>
  );
}

function MessageView({ message }: { message: ChatMessage }) {
  if (message.kind === "user-text") {
    return (
      <div className="rd-msg rd-msg-user">
        <div className="rd-bubble">{message.body}</div>
      </div>
    );
  }
  if (message.kind === "error") {
    return (
      <div className="rd-msg rd-msg-ai rd-msg-error">
        <div className="rd-avatar">
          <SparkleGlyph size={12} />
        </div>
        <div className="rd-body">{message.body}</div>
      </div>
    );
  }
  // prose | clarify — both render as plain assistant prose for now.
  return (
    <div className="rd-msg rd-msg-ai">
      <div className="rd-avatar">
        <SparkleGlyph size={12} />
      </div>
      <div className="rd-body">{message.body}</div>
    </div>
  );
}
