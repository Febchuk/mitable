"use client";

import * as React from "react";
import { Check, Loader2, Mic, Send, Sparkles, X } from "lucide-react";
import type { AgentMessage, AgentProposal } from "@/lib/ai/teacher-agent/types";

export interface AgentChatProps {
  classroomId: string;
  classroomName: string;
}

type ProposalState =
  | { state: "idle" }
  | { state: "applying" }
  | { state: "done"; message: string }
  | { state: "error"; message: string }
  | { state: "dismissed" };

interface AssistantExtras {
  proposals: AgentProposal[];
}

export function AgentChat({ classroomId, classroomName }: AgentChatProps) {
  const [messages, setMessages] = React.useState<AgentMessage[]>([]);
  const [extras, setExtras] = React.useState<Record<number, AssistantExtras>>({});
  const [proposalStates, setProposalStates] = React.useState<Record<string, ProposalState>>({});
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, proposalStates]);

  async function send(rawText: string) {
    const text = rawText.trim();
    if (!text || busy) return;
    setError(null);
    setInput("");
    const next: AgentMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setBusy(true);
    try {
      const res = await fetch("/api/v1/ai/agent/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ classroomId, messages: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
      const reply: string = data.reply ?? "";
      const proposals: AgentProposal[] = Array.isArray(data.proposals) ? data.proposals : [];
      setMessages((prev) => {
        const assistantIndex = prev.length;
        if (proposals.length > 0) {
          setExtras((e) => ({ ...e, [assistantIndex]: { proposals } }));
          setProposalStates((s) => {
            const copy = { ...s };
            for (const p of proposals) copy[p.id] = { state: "idle" };
            return copy;
          });
        }
        return [...prev, { role: "assistant", content: reply }];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmProposal(proposal: AgentProposal) {
    setProposalStates((s) => ({ ...s, [proposal.id]: { state: "applying" } }));
    try {
      const res = await fetch("/api/v1/ai/agent/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ classroomId, proposal }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
      if (data.ok) {
        setProposalStates((s) => ({
          ...s,
          [proposal.id]: { state: "done", message: data.message ?? "Done." },
        }));
      } else {
        setProposalStates((s) => ({
          ...s,
          [proposal.id]: { state: "error", message: data.message ?? "Couldn't apply that." },
        }));
      }
    } catch (err) {
      setProposalStates((s) => ({
        ...s,
        [proposal.id]: {
          state: "error",
          message: err instanceof Error ? err.message : "Couldn't apply that.",
        },
      }));
    }
  }

  function dismissProposal(id: string) {
    setProposalStates((s) => ({ ...s, [id]: { state: "dismissed" } }));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div
        ref={scrollRef}
        style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 16px 8px" }}
      >
        {messages.length === 0 ? (
          <EmptyState classroomName={classroomName} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.map((m, i) => (
              <React.Fragment key={i}>
                <MessageBubble role={m.role} text={m.content} />
                {extras[i]?.proposals.map((p) => (
                  <ProposalCard
                    key={p.id}
                    proposal={p}
                    state={proposalStates[p.id] ?? { state: "idle" }}
                    onConfirm={() => confirmProposal(p)}
                    onDismiss={() => dismissProposal(p.id)}
                  />
                ))}
              </React.Fragment>
            ))}
            {busy ? <Thinking /> : null}
          </div>
        )}
      </div>

      {error ? (
        <div
          style={{
            padding: "0 16px 8px",
            fontSize: 12,
            color: "var(--color-terracotta-deep, #b23c17)",
          }}
        >
          {error}
        </div>
      ) : null}

      <Composer input={input} setInput={setInput} busy={busy} onSend={() => send(input)} />
    </div>
  );
}

function MessageBubble({ role, text }: { role: "user" | "assistant"; text: string }) {
  const isUser = role === "user";
  return (
    <div
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "85%",
        background: isUser ? "var(--color-terracotta)" : "var(--color-surface)",
        color: isUser ? "var(--color-surface)" : "var(--color-ink)",
        border: isUser ? "none" : "1px solid var(--color-border)",
        borderRadius: 16,
        borderBottomRightRadius: isUser ? 4 : 16,
        borderBottomLeftRadius: isUser ? 16 : 4,
        padding: "9px 13px",
        fontSize: 14,
        lineHeight: 1.5,
        whiteSpace: "pre-wrap",
      }}
    >
      {text}
    </div>
  );
}

function ProposalCard({
  proposal,
  state,
  onConfirm,
  onDismiss,
}: {
  proposal: AgentProposal;
  state: ProposalState;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  if (state.state === "dismissed") return null;

  const done = state.state === "done";
  const errored = state.state === "error";

  return (
    <div
      style={{
        alignSelf: "flex-start",
        maxWidth: "92%",
        width: "100%",
        background: "var(--color-canvas)",
        border: "1px solid var(--color-border)",
        borderLeft: `3px solid ${done ? "var(--color-sage)" : "var(--color-terracotta)"}`,
        borderRadius: 12,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Sparkles
          size={14}
          strokeWidth={1.5}
          style={{ color: "var(--color-terracotta-deep, #b23c17)", flexShrink: 0 }}
        />
        <span style={{ fontSize: 13, color: "var(--color-ink)", lineHeight: 1.4 }}>
          {proposal.summary}
        </span>
      </div>

      {done ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--color-sage)",
          }}
        >
          <Check size={14} strokeWidth={2} /> {state.message}
        </div>
      ) : errored ? (
        <>
          <div style={{ fontSize: 12, color: "var(--color-terracotta-deep, #b23c17)" }}>
            {state.message}
          </div>
          <ActionRow
            onConfirm={onConfirm}
            onDismiss={onDismiss}
            applying={false}
            confirmLabel="Try again"
          />
        </>
      ) : (
        <ActionRow
          onConfirm={onConfirm}
          onDismiss={onDismiss}
          applying={state.state === "applying"}
          confirmLabel="Confirm"
        />
      )}
    </div>
  );
}

function ActionRow({
  onConfirm,
  onDismiss,
  applying,
  confirmLabel,
}: {
  onConfirm: () => void;
  onDismiss: () => void;
  applying: boolean;
  confirmLabel: string;
}) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button
        type="button"
        onClick={onConfirm}
        disabled={applying}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "var(--color-terracotta)",
          color: "var(--color-surface)",
          border: "none",
          borderRadius: 999,
          padding: "6px 14px",
          fontSize: 13,
          fontWeight: 600,
          cursor: applying ? "default" : "pointer",
          opacity: applying ? 0.7 : 1,
        }}
      >
        {applying ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Check size={13} strokeWidth={2} />
        )}
        {applying ? "Saving…" : confirmLabel}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        disabled={applying}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          background: "transparent",
          color: "var(--color-ink-muted)",
          border: "1px solid var(--color-border)",
          borderRadius: 999,
          padding: "6px 12px",
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        <X size={13} strokeWidth={1.5} /> Dismiss
      </button>
    </div>
  );
}

function Composer({
  input,
  setInput,
  busy,
  onSend,
}: {
  input: string;
  setInput: (v: string) => void;
  busy: boolean;
  onSend: () => void;
}) {
  const { supported, listening, toggle } = useDictation((t) =>
    setInput(input ? `${input} ${t}` : t)
  );

  return (
    <div
      style={{
        borderTop: "1px solid var(--color-border)",
        background: "var(--color-surface)",
        padding: 12,
        display: "flex",
        alignItems: "flex-end",
        gap: 8,
      }}
    >
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={1}
        placeholder="e.g. Mark Amara present and record she practiced the pink tower"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        style={{
          flex: 1,
          resize: "none",
          maxHeight: 120,
          border: "1px solid var(--color-border)",
          borderRadius: 12,
          background: "var(--color-canvas)",
          color: "var(--color-ink)",
          padding: "10px 12px",
          fontSize: 14,
          lineHeight: 1.4,
          fontFamily: "inherit",
        }}
      />
      {supported ? (
        <IconButton
          onClick={toggle}
          label={listening ? "Stop dictation" : "Dictate"}
          active={listening}
        >
          <Mic size={18} strokeWidth={1.5} />
        </IconButton>
      ) : null}
      <IconButton onClick={onSend} label="Send" disabled={busy || !input.trim()} primary>
        <Send size={18} strokeWidth={1.5} />
      </IconButton>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  label,
  disabled,
  primary,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  primary?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{
        width: 40,
        height: 40,
        flexShrink: 0,
        borderRadius: 12,
        border: primary ? "none" : "1px solid var(--color-border)",
        background: primary
          ? "var(--color-terracotta)"
          : active
            ? "var(--color-clay-soft)"
            : "var(--color-canvas)",
        color: primary ? "var(--color-surface)" : "var(--color-ink-secondary)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

function Thinking() {
  return (
    <div
      style={{
        alignSelf: "flex-start",
        display: "flex",
        alignItems: "center",
        gap: 8,
        color: "var(--color-ink-muted)",
        fontSize: 13,
        padding: "4px 2px",
      }}
    >
      <Loader2 size={14} className="animate-spin" /> Thinking…
    </div>
  );
}

function EmptyState({ classroomName }: { classroomName: string }) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        textAlign: "center",
        padding: 24,
        color: "var(--color-ink-muted)",
      }}
    >
      <Sparkles
        size={22}
        strokeWidth={1.5}
        style={{ color: "var(--color-terracotta-deep, #b23c17)" }}
      />
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-ink)" }}>Ask Mitable</div>
      <div style={{ fontSize: 13, lineHeight: 1.5, maxWidth: 320 }}>
        Tell me what happened in {classroomName} — mark attendance, record progress or grades, jot
        an observation, or start a daily report. I&apos;ll set it up and you confirm before anything
        saves.
      </div>
    </div>
  );
}

// ---- Browser dictation (progressive enhancement) ----

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function useDictation(onText: (t: string) => void) {
  const [supported, setSupported] = React.useState(false);
  const [listening, setListening] = React.useState(false);
  const recRef = React.useRef<SpeechRecognitionLike | null>(null);
  const onTextRef = React.useRef(onText);
  onTextRef.current = onText;

  React.useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (Ctor) {
      setSupported(true);
      const rec = new Ctor();
      rec.lang = "en-US";
      rec.interimResults = false;
      rec.continuous = false;
      rec.onresult = (event) => {
        const transcript = Array.from(
          { length: event.results.length },
          (_, i) => event.results[i][0].transcript
        )
          .join(" ")
          .trim();
        if (transcript) onTextRef.current(transcript);
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      recRef.current = rec;
    }
    return () => recRef.current?.stop();
  }, []);

  const toggle = React.useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    setListening((prev) => {
      if (prev) {
        rec.stop();
        return false;
      }
      try {
        rec.start();
        return true;
      } catch {
        return false;
      }
    });
  }, []);

  return { supported, listening, toggle };
}
