"use client";

import * as React from "react";
import { MessageSquare, Sparkles, X } from "lucide-react";
import { AgentThread } from "@/components/agent/AgentThread";
import { useMontessori } from "./store";

export interface ChatDockProps {
  classroomId: string | null;
  classroomName: string;
  schoolId: string;
  userId: string;
}

export function ChatDock(props: ChatDockProps) {
  const store = useMontessori();
  const isOpen = store.webChatMode === "open";

  return (
    <div className="hidden lg:block">
      {isOpen ? (
        <div
          className="anim-slide-up"
          style={{
            position: "fixed",
            bottom: 22,
            right: 22,
            width: 380,
            height: 540,
            background: "var(--color-canvas)",
            borderRadius: 18,
            overflow: "hidden",
            border: "1px solid var(--color-border)",
            boxShadow: "0 28px 60px rgba(42,39,35,0.22), 0 8px 20px rgba(42,39,35,0.08)",
            display: "flex",
            flexDirection: "column",
            zIndex: 40,
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
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
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink)" }}>
                Mitable
              </div>
              <div style={{ fontSize: 11, color: "var(--color-ink-muted)" }}>
                Capture &amp; review · {props.classroomName}
              </div>
            </div>
            <button
              type="button"
              className="tap"
              onClick={() => store.setWebChatMode("pill")}
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                background: "transparent",
                color: "var(--color-ink-muted)",
                border: "1px solid var(--color-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={14} strokeWidth={1.5} />
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {props.classroomId ? (
              <AgentThread
                classroomId={props.classroomId}
                classroomName={props.classroomName}
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
      ) : (
        <button
          type="button"
          className="tap"
          onClick={() => store.setWebChatMode("open")}
          style={{
            position: "fixed",
            bottom: 22,
            right: 22,
            zIndex: 40,
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--color-terracotta)",
            color: "var(--color-surface)",
            borderRadius: 999,
            padding: "12px 18px 12px 14px",
            border: 0,
            boxShadow: "0 14px 30px rgba(196,106,79,0.35), 0 4px 10px rgba(42,39,35,0.08)",
            fontSize: 14,
            fontWeight: 600,
            animation: "slide-up 240ms cubic-bezier(0.2,0.8,0.2,1)",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              background: "rgba(255,251,243,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MessageSquare size={18} strokeWidth={1.5} />
          </div>
          <span>Ask Mitable</span>
          {store.pendingObs > 0 && (
            <span
              style={{
                background: "var(--color-surface)",
                color: "var(--color-terracotta)",
                borderRadius: 999,
                padding: "1px 8px",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {store.pendingObs}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
