"use client";

import { useState } from "react";
import { Icon } from "./icons";
import { HistoryTrail } from "./reading-pane";
import styles from "./reports-v2.module.css";

type RailView = "chat" | "history";

export function ChatRail({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const [view, setView] = useState<RailView>("chat");

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
          <div className={styles.chatBody}>
            <ChatBubble who="ai" name="Mitable · 11:02a">
              The self-correction moment is unusually well-described. Want me to tighten the
              connection-to-plane paragraph?
            </ChatBubble>
            <ChatBubble who="me">Yes, link it to the math sequence next term.</ChatBubble>
            <ChatBubble who="ai" name="Mitable · 11:03a">
              Tightened — moved the quote up. Score 87 → 92.
            </ChatBubble>
          </div>
          <div className={styles.chatInputRow}>
            <input type="text" placeholder="Ask Mitable, or comment for reviewers…" />
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              style={{ padding: "7px 11px" }}
            >
              <Icon.Send size={13} />
            </button>
          </div>
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
        <div className={`${styles.av} ${styles.avXs} ${styles.avSage}`}>MW</div>
        <div className={`${styles.av} ${styles.avXs} ${styles.avClay}`}>DR</div>
        <div className={styles.collapsedBadge}>2</div>
      </div>
    </aside>
  );
}

function ChatBubble({
  who,
  name,
  children,
}: {
  who: "ai" | "me" | "review";
  name?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${styles.msg} ${
        who === "ai" ? styles.msgAi : who === "me" ? styles.msgMe : styles.msgReview
      }`}
    >
      {who !== "me" && <div className={`${styles.av} ${styles.avSm} ${styles.avClay}`}>AI</div>}
      <div>
        {name && <div className={styles.msgWho}>{name}</div>}
        <div className="bubble">
          <div
            style={{
              padding: "8px 11px",
              borderRadius: who === "me" ? "13px 13px 4px 13px" : "13px 13px 13px 4px",
              background: who === "me" ? "var(--color-terracotta-soft)" : "var(--color-muted)",
              color: who === "me" ? "var(--color-terracotta-deep)" : "inherit",
              fontSize: 12.5,
              lineHeight: 1.45,
              maxWidth: 240,
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
