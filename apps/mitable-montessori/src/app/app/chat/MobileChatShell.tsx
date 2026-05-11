"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { UnifiedChatThread } from "@/components/chat/UnifiedChatThread";

export interface MobileChatShellProps {
  classroomId: string | null;
  classroomName: string;
  schoolId: string;
  userId: string;
}

export function MobileChatShell(props: MobileChatShellProps) {
  const router = useRouter();
  const [threadId] = React.useState(() => `thread-${crypto.randomUUID()}`);

  return (
    <div
      className="anim-fade-in"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 25,
        background: "var(--color-canvas)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "12px 18px",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-surface)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <button
          type="button"
          className="tap"
          onClick={() => router.back()}
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            background: "var(--color-canvas)",
            border: "1px solid var(--color-border)",
            color: "var(--color-ink-secondary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
          aria-label="Close"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            background: "var(--color-clay-soft)",
            color: "var(--color-terracotta-deep)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Sparkles size={14} strokeWidth={1.5} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink)" }}>Mitable</div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-sage)",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span className="live-dot" />
            <span>{props.classroomName} · work cycle</span>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {props.classroomId ? (
          <UnifiedChatThread
            threadId={threadId}
            classroomId={props.classroomId}
            schoolId={props.schoolId}
            userId={props.userId}
          />
        ) : (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
              textAlign: "center",
              fontSize: 13,
              color: "var(--color-ink-muted)",
              lineHeight: 1.5,
            }}
          >
            You aren&apos;t assigned to a classroom yet. Ask an admin to add you to one before
            capturing observations.
          </div>
        )}
      </div>
    </div>
  );
}
