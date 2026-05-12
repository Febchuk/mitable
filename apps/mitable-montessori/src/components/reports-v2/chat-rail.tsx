"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { HistoryTrail } from "./reading-pane";
import { fetchReportChat, postReportChatTurn, type ChatTurnMessage } from "@/lib/reports-v2/api";
import styles from "./reports-v2.module.css";

type RailView = "chat" | "history";

/**
 * Layout-C side rail. Pulls real chat from
 * `/api/v1/reports/[id]/chat` and posts new turns via `/chat/turn`.
 *
 * The chat schema supports 8 message kinds (user-text, prose, clarify,
 * proposal, chips, obs-ref, ghost-edit, new-section). Phase 6 renders the
 * three conversational kinds (user-text, prose, clarify) inline. The five
 * action-bearing kinds render as a non-interactive bubble with a
 * "Open editor to act on this" hint — the v2 reading pane doesn't yet
 * support applying ghost edits / accepting proposals, so we punt to the
 * legacy report editor for now.
 */
export function ChatRail({
  reportId,
  collapsed,
  onToggleCollapsed,
}: {
  /** Required when wired to real chat. Null disables fetch + send. */
  reportId: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const [view, setView] = useState<RailView>("chat");
  const [messages, setMessages] = useState<ChatTurnMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Load history whenever the selected report changes.
  useEffect(() => {
    if (!reportId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchReportChat(reportId)
      .then((rows) => {
        if (cancelled) return;
        setMessages(rows);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  // Keep the scroll pinned to the latest message when new messages arrive.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const onSend = async () => {
    const text = input.trim();
    if (!text || !reportId || sending) return;
    setSending(true);
    setSendError(null);
    // Optimistic append of the user message so they don't see a 1-2s blank.
    // The server returns its own canonical user-message row in the response;
    // we replace the optimistic one when it lands.
    const optimisticId = `optimistic-${Date.now()}`;
    setMessages((m) => [
      ...m,
      {
        id: optimisticId,
        kind: "user-text",
        body: text,
        createdAt: new Date().toISOString(),
        actorRole: "teacher",
      } as ChatTurnMessage,
    ]);
    setInput("");
    try {
      const turnMessages = await postReportChatTurn({ reportId, userMessage: text });
      // Strip the optimistic placeholder; append everything the server gave us.
      setMessages((m) => [...m.filter((x) => x.id !== optimisticId), ...turnMessages]);
    } catch (e) {
      setSendError((e as Error).message);
      // Roll back the optimistic message so the user can retry.
      setMessages((m) => m.filter((x) => x.id !== optimisticId));
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  return (
    <aside className={styles.chatRail}>
      <div className={styles.chatHead}>
        <div className={styles.chatHeadText}>
          <div className={styles.railTabs}>
            <button
              type="button"
              className={view === "chat" ? styles.railTabActive : ""}
              onClick={() => {
                setView("chat");
                if (collapsed) onToggleCollapsed();
              }}
            >
              Editor
            </button>
            <button
              type="button"
              className={view === "history" ? styles.railTabActive : ""}
              onClick={() => {
                setView("history");
                if (collapsed) onToggleCollapsed();
              }}
            >
              History
              <span className={styles.railTabCount}>5</span>
            </button>
          </div>
        </div>
        <button
          type="button"
          className={styles.collapseBtn}
          onClick={onToggleCollapsed}
          title={collapsed ? "Expand chat" : "Collapse chat"}
        >
          <Icon.ChevronRight size={14} />
        </button>
      </div>

      {view === "chat" && (
        <>
          <div className={styles.chatBody} ref={scrollRef}>
            {!reportId ? (
              <ChatEmpty msg="Select a report to chat about." />
            ) : loading ? (
              <ChatEmpty msg="Loading…" />
            ) : loadError ? (
              <ChatError msg={loadError} />
            ) : messages.length === 0 ? (
              <ChatEmpty msg="No messages yet. Ask Mitable to draft, polish, or check this report." />
            ) : (
              messages.map((m) => <ChatMessage key={m.id} message={m} />)
            )}
            {sending && <ChatEmpty msg="Mitable is thinking…" />}
          </div>
          <div className={styles.chatInputRow}>
            <input
              type="text"
              placeholder={
                reportId ? "Ask Mitable, or comment for reviewers…" : "Select a report first"
              }
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (sendError) setSendError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void onSend();
                }
              }}
              disabled={!reportId || sending}
            />
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              style={{ padding: "7px 11px", opacity: !reportId || sending ? 0.6 : 1 }}
              disabled={!reportId || sending || input.trim().length === 0}
              onClick={() => void onSend()}
              aria-label="Send message"
            >
              <Icon.Send size={13} />
            </button>
          </div>
          {sendError && (
            <div
              style={{
                padding: "8px 12px 12px",
                fontSize: 11.5,
                color: "var(--color-terracotta-deep)",
                background: "var(--color-terracotta-soft)",
              }}
            >
              {sendError}
            </div>
          )}
        </>
      )}

      {view === "history" && (
        <div className={styles.railHistory}>
          <HistoryTrail compact />
        </div>
      )}

      {/* Collapsed-state icon stack */}
      <div className={styles.collapsedRail}>
        <button
          type="button"
          title="Open editor"
          onClick={() => {
            setView("chat");
            onToggleCollapsed();
          }}
        >
          <Icon.MessageCircle size={16} />
        </button>
        <button
          type="button"
          title="Open history"
          onClick={() => {
            setView("history");
            onToggleCollapsed();
          }}
          style={{
            background: "color-mix(in srgb, var(--color-sage-soft) 60%, var(--color-surface))",
            color: "var(--color-sage-deep)",
          }}
        >
          <Icon.Clock size={15} />
        </button>
        {messages.length > 0 && <div className={styles.collapsedBadge}>{messages.length}</div>}
      </div>
    </aside>
  );
}

/** Renders one chat message. The reports chat schema supports 8 message
 *  kinds; this component currently styles the three conversational ones
 *  (user-text, prose, clarify) plus a fallback affordance for action-bearing
 *  kinds (proposal, ghost-edit, etc) that aren't yet actionable in the v2
 *  reading pane. */
function ChatMessage({ message }: { message: ChatTurnMessage }) {
  if (message.kind === "user-text") {
    return <Bubble who="me" body={message.body} />;
  }
  if (message.kind === "prose") {
    return <Bubble who="ai" name="Mitable" body={message.body} />;
  }
  if (message.kind === "clarify") {
    return <Bubble who="ai" name="Mitable" body={message.body} />;
  }
  if (message.kind === "chips") {
    return (
      <Bubble
        who="ai"
        name="Mitable"
        body={
          <>
            <div>{message.body}</div>
            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 5 }}>
              {message.chips.map((c, i) => (
                <span
                  key={i}
                  style={{
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    fontSize: 11,
                    color: "var(--color-ink-secondary)",
                  }}
                >
                  {c.label}
                </span>
              ))}
            </div>
          </>
        }
      />
    );
  }
  // Proposal / ghost-edit / obs-ref / new-section all carry a target the
  // teacher needs to accept or dismiss. The v2 reading pane doesn't yet
  // surface the inline editor, so we render a deflection link.
  const label =
    message.kind === "proposal"
      ? "Mitable proposed a rewrite"
      : message.kind === "ghost-edit"
        ? "Mitable suggested a ghost edit"
        : message.kind === "obs-ref"
          ? "Mitable cited an observation"
          : "Mitable drafted a new section";
  const body =
    message.kind === "proposal"
      ? message.lead
      : message.kind === "ghost-edit"
        ? message.body
        : message.kind === "obs-ref"
          ? message.body
          : message.body;
  return (
    <Bubble
      who="ai"
      name="Mitable"
      body={
        <>
          <div style={{ fontWeight: 600, fontSize: 12 }}>{label}</div>
          <div style={{ marginTop: 3 }}>{body}</div>
          <div
            style={{
              marginTop: 6,
              fontSize: 10.5,
              color: "var(--color-ink-muted)",
              fontStyle: "italic",
            }}
          >
            Open the editor to accept or dismiss this.
          </div>
        </>
      }
    />
  );
}

function Bubble({ who, name, body }: { who: "ai" | "me"; name?: string; body: React.ReactNode }) {
  return (
    <div className={`${styles.msg} ${who === "ai" ? styles.msgAi : styles.msgMe}`}>
      {who === "ai" && <div className={`${styles.av} ${styles.avSm} ${styles.avClay}`}>AI</div>}
      <div>
        {name && <div className={styles.msgWho}>{name}</div>}
        <div
          style={{
            padding: "8px 11px",
            borderRadius: who === "me" ? "13px 13px 4px 13px" : "13px 13px 13px 4px",
            background: who === "me" ? "var(--color-terracotta-soft)" : "var(--color-muted)",
            color: who === "me" ? "var(--color-terracotta-deep)" : "inherit",
            fontSize: 12.5,
            lineHeight: 1.45,
            maxWidth: 260,
          }}
        >
          {body}
        </div>
      </div>
    </div>
  );
}

function ChatEmpty({ msg }: { msg: string }) {
  return (
    <div
      style={{
        padding: "16px 4px",
        fontSize: 12,
        color: "var(--color-ink-muted)",
        textAlign: "center",
      }}
    >
      {msg}
    </div>
  );
}

function ChatError({ msg }: { msg: string }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        margin: "8px 4px",
        background: "var(--color-terracotta-soft)",
        color: "var(--color-terracotta-deep)",
        fontSize: 12,
        borderRadius: 10,
      }}
    >
      {msg}
    </div>
  );
}
