"use client";

import * as React from "react";
import { Camera, Image as ImageIcon, Lock, Mic, Send, Sparkles, WifiOff } from "lucide-react";
import {
  findChild,
  initialsFor,
  type ChatMessage,
  type ObservationMessage,
  type VoiceMessage as TVoiceMessage,
  type UserMessage as TUserMessage,
} from "./data";
import { Avatar, HandCheck, ToastBus, VoiceWave } from "./primitives";
import { useChatComposer, useMontessori } from "./store";

const attachBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  background: "var(--color-canvas)",
  color: "var(--color-ink-secondary)",
  border: "1px solid var(--color-border)",
  borderRadius: 999,
  padding: "5px 11px",
  fontSize: 12,
  fontWeight: 500,
};

function AssistantBubble({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="anim-fade-in"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        marginBottom: 10,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          flexShrink: 0,
          background: "var(--color-clay-soft)",
          color: "var(--color-terracotta-deep)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Sparkles size={14} strokeWidth={1.5} />
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--color-ink-secondary)",
          lineHeight: 1.5,
          paddingTop: 5,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          flexShrink: 0,
          background: "var(--color-clay-soft)",
          color: "var(--color-terracotta-deep)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Sparkles size={14} strokeWidth={1.5} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, paddingTop: 11 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 5,
              height: 5,
              borderRadius: 999,
              background: "var(--color-clay)",
              animation: `dotpulse 1.2s ease-in-out ${i * 0.15}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ObservationCard({ msg, compact = false }: { msg: ObservationMessage; compact?: boolean }) {
  const store = useMontessori();
  const child = findChild(msg.childId);
  const isApproved = msg.status === "approved";
  const accent =
    msg.accent === "sage"
      ? "var(--color-sage)"
      : msg.accent === "clay"
        ? "var(--color-clay)"
        : "var(--color-butter)";
  const labelColor =
    msg.accent === "sage"
      ? "var(--color-sage)"
      : msg.accent === "clay"
        ? "var(--color-clay)"
        : "#9C7E2E";
  const [editing, setEditing] = React.useState(false);
  const [draftBody, setDraftBody] = React.useState(msg.body);

  return (
    <div
      className={isApproved ? "" : "anim-pop-in"}
      style={{
        background: "var(--color-surface)",
        borderRadius: 14,
        border: "1px solid var(--color-border)",
        borderLeft: `3px solid ${accent}`,
        padding: compact ? 12 : 14,
        marginLeft: 38,
        marginBottom: 8,
        opacity: isApproved ? 0.78 : 1,
        transition: "opacity 200ms ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <Avatar
          initials={child ? initialsFor(child.name) : "··"}
          tone={child ? child.tone : "clay"}
          size={compact ? 26 : 28}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: compact ? 13 : 13.5,
              fontWeight: 600,
              color: "var(--color-ink)",
            }}
          >
            {child ? child.name : "Unknown"}
          </div>
          <div className="label-cap" style={{ color: labelColor }}>
            {msg.area === "Private note"
              ? `Private note · ${msg.level}`
              : `${msg.area} · ${msg.level}`}
          </div>
        </div>
        {isApproved && <HandCheck color="var(--color-sage)" size={18} />}
      </div>
      {editing ? (
        <textarea
          value={draftBody}
          onChange={(e) => setDraftBody(e.target.value)}
          autoFocus
          rows={3}
          style={{
            width: "100%",
            resize: "vertical",
            fontSize: 13.5,
            border: "1px solid var(--color-border-strong)",
            borderRadius: 10,
            padding: 10,
            background: "var(--color-canvas)",
            color: "var(--color-ink)",
            lineHeight: 1.5,
            marginBottom: 8,
          }}
        />
      ) : (
        <div
          style={{
            fontSize: compact ? 13 : 13.5,
            color: "var(--color-ink)",
            lineHeight: 1.5,
            marginBottom: isApproved ? 0 : 10,
          }}
        >
          {msg.body}
          {msg.edited && (
            <span
              style={{
                marginLeft: 6,
                fontSize: 11,
                color: "var(--color-ink-muted)",
                fontStyle: "italic",
              }}
            >
              · edited
            </span>
          )}
        </div>
      )}
      {!isApproved &&
        (editing ? (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className="tap"
              onClick={() => {
                store.editObservation(msg.id, draftBody);
                setEditing(false);
              }}
              style={{
                flex: 1,
                background: "var(--color-terracotta)",
                color: "var(--color-surface)",
                border: 0,
                borderRadius: 9,
                padding: "7px 0",
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              Save
            </button>
            <button
              type="button"
              className="tap"
              onClick={() => {
                setEditing(false);
                setDraftBody(msg.body);
              }}
              style={{
                background: "transparent",
                color: "var(--color-ink-secondary)",
                border: "1px solid var(--color-border)",
                borderRadius: 9,
                padding: "7px 12px",
                fontSize: 12.5,
                fontWeight: 500,
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className="tap"
              onClick={() => store.approveObservation(msg.id)}
              style={{
                flex: 1,
                background: "var(--color-terracotta)",
                color: "var(--color-surface)",
                border: 0,
                borderRadius: 9,
                padding: "7px 0",
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              Approve
            </button>
            <button
              type="button"
              className="tap"
              onClick={() => setEditing(true)}
              style={{
                background: "transparent",
                color: "var(--color-ink-secondary)",
                border: "1px solid var(--color-border)",
                borderRadius: 9,
                padding: "7px 12px",
                fontSize: 12.5,
                fontWeight: 500,
              }}
            >
              Edit
            </button>
            <button
              type="button"
              className="tap"
              onClick={() => store.setAsideObservation(msg.id)}
              style={{
                background: "transparent",
                color: "var(--color-ink-muted)",
                border: "1px solid var(--color-border)",
                borderRadius: 9,
                padding: "7px 10px",
                fontSize: 12.5,
                fontWeight: 500,
              }}
            >
              Set aside
            </button>
          </div>
        ))}
      {isApproved && (
        <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--color-sage)" }}>
          Approved · synced to {child ? child.name.split(" ")[0] : "child"}&apos;s record
        </div>
      )}
    </div>
  );
}

function VoiceMessageBubble({ msg, small = false }: { msg: TVoiceMessage; small?: boolean }) {
  const [playing, setPlaying] = React.useState(false);
  return (
    <div className="anim-fade-in">
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
        <div
          style={{
            background: "var(--color-terracotta)",
            color: "var(--color-surface)",
            borderRadius: "16px 16px 4px 16px",
            padding: small ? "8px 12px" : "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: small ? 10 : 12,
            maxWidth: "78%",
          }}
        >
          <button
            type="button"
            className="tap"
            onClick={() => setPlaying((p) => !p)}
            style={{
              width: small ? 24 : 28,
              height: small ? 24 : 28,
              borderRadius: 999,
              background: "rgba(255,251,243,0.2)",
              border: 0,
              color: "var(--color-surface)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {playing ? (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                <rect x="2" y="2" width="3" height="8" rx="0.5" />
                <rect x="7" y="2" width="3" height="8" rx="0.5" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                <path d="M3 2l7 4-7 4z" />
              </svg>
            )}
          </button>
          <VoiceWave animated={playing} />
          <span className="font-numeric" style={{ fontSize: small ? 11 : 12, opacity: 0.85 }}>
            {msg.duration}
          </span>
        </div>
      </div>
      {msg.transcript && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <div
            style={{
              maxWidth: "78%",
              fontSize: 12,
              color: "var(--color-ink-muted)",
              textAlign: "right",
              fontStyle: "italic",
              lineHeight: 1.45,
            }}
          >
            {msg.transcript.split(". ").map((s, i, arr) => (
              <React.Fragment key={i}>
                {s}
                {i < arr.length - 1 ? "." : ""}
                {i < arr.length - 1 && <br />}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UserBubble({ msg }: { msg: TUserMessage }) {
  return (
    <div
      className="anim-fade-in"
      style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}
    >
      <div
        style={{
          background: "var(--color-terracotta)",
          color: "var(--color-surface)",
          borderRadius: "16px 16px 4px 16px",
          padding: "10px 14px",
          maxWidth: "78%",
          fontSize: 13.5,
          lineHeight: 1.45,
        }}
      >
        {msg.text}
      </div>
    </div>
  );
}

function ChatDivider({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 12px" }}>
      <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
      <div className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
        {label}
      </div>
      <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
    </div>
  );
}

export function ChatThread({
  compact = false,
  thinking,
}: {
  compact?: boolean;
  thinking?: boolean;
}) {
  const { chat } = useMontessori();
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [chat.length, thinking]);
  return (
    <div
      ref={ref}
      className="scroll-quiet"
      style={{
        flex: 1,
        overflowY: "auto",
        padding: compact ? "12px 14px" : "12px 16px 16px",
      }}
    >
      {chat.map((m: ChatMessage) => {
        if (m.type === "divider") return <ChatDivider key={m.id} label={m.label} />;
        if (m.type === "assistant") return <AssistantBubble key={m.id}>{m.text}</AssistantBubble>;
        if (m.type === "observation")
          return <ObservationCard key={m.id} msg={m} compact={compact} />;
        if (m.type === "voice") return <VoiceMessageBubble key={m.id} msg={m} small={compact} />;
        if (m.type === "user") return <UserBubble key={m.id} msg={m} />;
        return null;
      })}
      {thinking && <ThinkingBubble />}
    </div>
  );
}

const QUICK_PROMPTS = [
  "Mira mastered the teen board",
  "Levi tried sandpaper letters",
  "Diego built the pink tower",
];

export function ChatComposer({ small = false }: { small?: boolean }) {
  const { online, addUserMessage } = useMontessori();
  const composer = useChatComposer();
  const placeholder = composer.recording
    ? `Listening… ${String(Math.floor(composer.recordSecs / 60)).padStart(1, "0")}:${String(composer.recordSecs % 60).padStart(2, "0")}`
    : "Tell me what you saw…";

  const fakePhoto = () => {
    if (!composer.text) {
      ToastBus.push({
        message: 'Photo attached · "Mira at the teen board"',
        icon: <Camera size={12} strokeWidth={1.5} />,
      });
    }
    setTimeout(() => addUserMessage("[photo · 1 attached]"), 80);
  };

  const sendDisabled = !composer.text.trim() || composer.thinking;

  return (
    <div
      style={{
        borderTop: "1px solid var(--color-border)",
        background: "var(--color-surface)",
        padding: small ? "10px 12px 14px" : "10px 14px 18px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: small ? 8 : 10,
          flexWrap: "wrap",
        }}
      >
        <button type="button" className="tap" style={attachBtn} onClick={fakePhoto}>
          <Camera size={14} strokeWidth={1.5} />
          <span>Photo</span>
        </button>
        <button type="button" className="tap" style={attachBtn} onClick={fakePhoto}>
          <ImageIcon size={14} strokeWidth={1.5} />
          <span>Library</span>
        </button>
        <div style={{ flex: 1 }} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 10,
            color: online ? "var(--color-ink-muted)" : "var(--color-terracotta-deep)",
          }}
        >
          {online ? (
            <>
              <Lock size={11} strokeWidth={1.5} /> stays on device
            </>
          ) : (
            <>
              <WifiOff size={11} strokeWidth={1.5} /> queued · syncs when back
            </>
          )}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
          background: "var(--color-canvas)",
          borderRadius: 14,
          border: "1px solid var(--color-border)",
          padding: "8px 8px 8px 14px",
        }}
      >
        <textarea
          rows={1}
          value={composer.text}
          onChange={(e) => composer.setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void composer.send();
            }
          }}
          placeholder={placeholder}
          disabled={composer.recording}
          style={{
            flex: 1,
            fontSize: 14,
            color: "var(--color-ink)",
            background: "transparent",
            border: 0,
            padding: "6px 0",
            minHeight: 22,
            lineHeight: 1.5,
            resize: "none",
          }}
        />
        <button
          type="button"
          className={`tap ${composer.recording ? "mic-recording" : ""}`}
          onMouseDown={composer.startRecording}
          onMouseUp={composer.stopRecording}
          onTouchStart={(e) => {
            e.preventDefault();
            composer.startRecording();
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            void composer.stopRecording();
          }}
          title="Hold to record"
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
            background: composer.recording ? "var(--color-terracotta)" : "transparent",
            color: composer.recording ? "var(--color-surface)" : "var(--color-ink-secondary)",
            border: composer.recording ? "0" : "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Mic size={18} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          className="tap"
          onClick={() => void composer.send()}
          disabled={sendDisabled}
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
            background: composer.text.trim() ? "var(--color-terracotta)" : "var(--color-clay-soft)",
            color: composer.text.trim() ? "var(--color-surface)" : "var(--color-ink-muted)",
            border: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: composer.text.trim() ? "0 6px 14px rgba(196,106,79,0.3)" : "none",
            cursor: sendDisabled ? "default" : "pointer",
          }}
        >
          {composer.thinking ? <span className="spinner" /> : <Send size={18} strokeWidth={1.5} />}
        </button>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        {QUICK_PROMPTS.map((s, i) => (
          <button
            key={i}
            type="button"
            className="tap"
            onClick={() => composer.setText(s)}
            style={{
              fontSize: 11,
              padding: "4px 10px",
              borderRadius: 999,
              background: "var(--color-canvas)",
              border: "1px dashed var(--color-border-strong)",
              color: "var(--color-ink-secondary)",
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChatPanel({ small = false }: { small?: boolean }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <ChatThread compact={small} />
      <ChatComposer small={small} />
    </div>
  );
}
