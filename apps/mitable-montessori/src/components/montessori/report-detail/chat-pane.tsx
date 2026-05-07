"use client";

import * as React from "react";
import { Camera, Check, Clock, Mic, Plus, RotateCcw, Send, Undo2, X } from "lucide-react";
import { ToastBus } from "../primitives";
import { SparkleGlyph } from "./icons";
import type {
  ChatAttachment,
  ChatChip,
  ChatGhostEdit,
  ChatObsRefSuggestedTarget,
  ChatProposalTarget,
  ChatTurnMessage,
  TargetRef,
} from "@/lib/schemas/report-chat";
import { startCamera, type CameraSession } from "@/lib/capture/camera-capture";
import { TesseractOcrEngine } from "@/lib/capture/ocr-engine";

const COMING_SOON_MIC = "Voice input lands in a later phase — type for now.";
const HISTORY_HIDDEN = "Conversation history will land later — one thread per report for now.";

type ChatMessage = ChatTurnMessage | { kind: "error"; id: string; body: string };

export interface ChatPaneSection {
  id: string;
  heading: string;
  paragraphs: { id: string; html: string }[];
}

/** Imperative API exposed via ref so the report pane can seed a chat turn. */
export interface ChatPaneHandle {
  seedTurn(opts: { targetRef: TargetRef; targetLabel?: string }): void;
}

export interface ChatPaneProps {
  reportId: string;
  /**
   * Snapshot of the report's sections used for stale detection on Apply.
   * The chat-pane compares proposal.oldText to current paragraph html to
   * decide if the user has edited the paragraph since the proposal landed.
   */
  sections: ChatPaneSection[];
  /**
   * Apply the proposal's newText to the report. The parent should mutate
   * its LocalDetail via its own onChange path so debounced autosave fires.
   */
  onApplyProposal: (args: { sectionId: string; paragraphId: string; newText: string }) => void;
  /**
   * Insert a captured observation as a new paragraph. The parent decides
   * which section to insert into when no suggestedTarget is present.
   */
  onPullObservation?: (args: { text: string; suggestedTarget?: ChatObsRefSuggestedTarget }) => void;
  /**
   * Merge a ghost-edit suggestion into the report pane's section slot. The
   * report pane already renders ghosts inline (Accept/Reject/Edit-first).
   * `messageId` is the originating chat message — the parent uses it to
   * record applied/dismissed via /chat/messages/[id]/applied.
   */
  onApplyGhostEdit?: (args: {
    sectionId: string;
    ghostEdit: ChatGhostEdit;
    messageId: string;
  }) => void;
  /**
   * Awaits any pending debounced PATCH so the agent's read_report_sections
   * reflects the user's latest typing. Plan §7 single most important
   * integration concern.
   */
  flushPendingSave?: () => Promise<void>;
}

export const ChatPane = React.forwardRef<ChatPaneHandle, ChatPaneProps>(function ChatPane(
  { reportId, sections, onApplyProposal, onPullObservation, onApplyGhostEdit, flushPendingSave },
  ref
) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [historyLoaded, setHistoryLoaded] = React.useState(false);
  const [pinnedTarget, setPinnedTarget] = React.useState<{
    ref: TargetRef;
    label: string;
  } | null>(null);
  const [undo, setUndo] = React.useState<{
    sectionId: string;
    paragraphId: string;
    before: string;
    label: string;
  } | null>(null);
  const [pendingAttachments, setPendingAttachments] = React.useState<ChatAttachment[]>([]);
  const [cameraSession, setCameraSession] = React.useState<CameraSession | null>(null);
  const [cameraStatus, setCameraStatus] = React.useState<
    "idle" | "opening" | "ready" | "capturing" | "ocr" | "uploading" | "error"
  >("idle");
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const ocrRef = React.useRef<TesseractOcrEngine | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const undoTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useImperativeHandle(
    ref,
    () => ({
      seedTurn: ({ targetRef, targetLabel }) => {
        setPinnedTarget({
          ref: targetRef,
          label: targetLabel ?? "this paragraph",
        });
        requestAnimationFrame(() => textareaRef.current?.focus());
      },
    }),
    []
  );

  // Auto-scroll to bottom on new messages.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, sending]);

  // When a ghost-edit message arrives that hasn't been applied/dismissed yet,
  // merge it into the report pane's section slot so it renders inline. We
  // track which ones we've already merged so re-renders don't double-fire.
  const mergedGhostIdsRef = React.useRef(new Set<string>());
  React.useEffect(() => {
    if (!onApplyGhostEdit) return;
    for (const m of messages) {
      if (m.kind !== "ghost-edit") continue;
      if (m.appliedAt || m.dismissedAt) continue;
      if (mergedGhostIdsRef.current.has(m.id)) continue;
      mergedGhostIdsRef.current.add(m.id);
      onApplyGhostEdit({
        sectionId: m.target.sectionId,
        ghostEdit: m.ghostEdit,
        messageId: m.id,
      });
    }
  }, [messages, onApplyGhostEdit]);

  // Bind the live camera stream to the inline viewfinder once both exist.
  React.useEffect(() => {
    if (!cameraSession || !videoRef.current) return;
    videoRef.current.srcObject = cameraSession.stream;
    void videoRef.current.play().catch(() => {
      /* autoplay policy — user can hit capture anyway */
    });
  }, [cameraSession]);

  // Tear down camera + OCR worker when the chat pane unmounts.
  React.useEffect(() => {
    return () => {
      cameraSession?.stop();
      ocrRef.current?.destroy();
      ocrRef.current = null;
    };
  }, [cameraSession]);

  const openCamera = React.useCallback(async () => {
    if (cameraSession) return;
    setCameraStatus("opening");
    setCameraError(null);
    try {
      const session = await startCamera({ facingMode: "environment" });
      setCameraSession(session);
      setCameraStatus("ready");
      // Pre-warm Tesseract in the background so the first capture isn't slow.
      if (!ocrRef.current) {
        ocrRef.current = new TesseractOcrEngine();
        void ocrRef.current.init().catch(() => {
          // OCR isn't fatal — we'll skip it on failure and let the agent
          // search by recency only.
        });
      }
    } catch (err) {
      setCameraStatus("error");
      setCameraError((err as Error).message || "Couldn't open the camera.");
    }
  }, [cameraSession]);

  const closeCamera = React.useCallback(() => {
    cameraSession?.stop();
    setCameraSession(null);
    setCameraStatus("idle");
    setCameraError(null);
  }, [cameraSession]);

  const captureAndAttach = React.useCallback(async () => {
    if (!cameraSession) return;
    setCameraStatus("capturing");
    setCameraError(null);
    try {
      const blob = await cameraSession.capture();
      // Run OCR client-side. If the engine isn't ready or fails, ship the
      // photo without text — the agent can still surface it by recency.
      let ocrText = "";
      if (ocrRef.current) {
        setCameraStatus("ocr");
        try {
          const r = await ocrRef.current.recognize(blob);
          ocrText = (r.text ?? "").trim();
        } catch {
          // Skip OCR on engine error.
        }
      }
      setCameraStatus("uploading");
      const form = new FormData();
      form.append("photo", blob, "capture.jpg");
      if (ocrText) form.append("ocrText", ocrText);
      form.append("capturedAt", new Date().toISOString());
      const res = await fetch(`/api/v1/reports/${reportId}/chat/artifacts`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || "Upload failed");
      }
      const json = (await res.json()) as {
        artifactId: string;
        ocrText: string | null;
        capturedAt: string;
      };
      setPendingAttachments((prev) => [
        ...prev,
        {
          kind: "photo",
          artifactId: json.artifactId,
          ...(json.ocrText ? { ocrText: json.ocrText } : {}),
          ...(json.capturedAt ? { capturedAt: json.capturedAt } : {}),
        },
      ]);
      // Close the viewfinder once the attachment chip lands so the teacher
      // can keep typing without dismissing the camera manually.
      cameraSession.stop();
      setCameraSession(null);
      setCameraStatus("idle");
    } catch (err) {
      setCameraStatus("error");
      setCameraError((err as Error).message || "Capture failed.");
    }
  }, [cameraSession, reportId]);

  const removeAttachment = React.useCallback((artifactId: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.artifactId !== artifactId));
  }, []);

  // Load persisted thread on mount.
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/v1/reports/${reportId}/chat`, {
          credentials: "include",
        });
        if (!res.ok) {
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

    // Flush any pending debounced save so the agent reads fresh state.
    try {
      await flushPendingSave?.();
    } catch {
      // A save failure shouldn't block the chat — the toast will surface it.
    }

    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: ChatTurnMessage = {
      kind: "user-text",
      id: tempId,
      body: trimmed,
      ...(pinnedTarget ? { targetRef: pinnedTarget.ref } : {}),
    };
    setMessages((prev) => [...prev, optimistic]);
    const sentTargetRef = pinnedTarget?.ref;
    const sentAttachments = pendingAttachments;
    setInput("");
    setPinnedTarget(null);
    setPendingAttachments([]);
    setSending(true);

    try {
      const res = await fetch(`/api/v1/reports/${reportId}/chat/turn`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userMessage: trimmed,
          ...(sentTargetRef ? { targetRef: sentTargetRef } : {}),
          ...(sentAttachments.length > 0 ? { attachments: sentAttachments } : {}),
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== tempId),
          optimistic,
          {
            kind: "error",
            id: `e-${crypto.randomUUID()}`,
            body: j.error || "Something went wrong. Try again.",
          },
        ]);
        // Restore attachments so the teacher can retry without re-uploading.
        if (sentAttachments.length > 0) setPendingAttachments(sentAttachments);
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
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [input, reportId, sending, pinnedTarget, pendingAttachments, flushPendingSave]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void onSend();
    }
  };

  /** Records the editorial action (applied/dismissed/regenerated) on the message row. */
  const recordAction = React.useCallback(
    async (
      messageId: string,
      action: "applied" | "dismissed" | "regenerated",
      appliedTo?: { sectionId: string; paragraphId: string; before: string; after: string }
    ) => {
      try {
        await fetch(`/api/v1/reports/${reportId}/chat/messages/${messageId}/applied`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, appliedTo }),
        });
      } catch {
        // The mutation already happened locally — audit failure is non-fatal.
      }
    },
    [reportId]
  );

  /** Find the *current* paragraph html for stale detection. */
  const findParagraphText = React.useCallback(
    (sectionId: string, paragraphId: string): string | null => {
      const section = sections.find((s) => s.id === sectionId);
      if (!section) return null;
      const para = section.paragraphs.find((p) => p.id === paragraphId);
      if (!para) return null;
      return stripHtml(para.html);
    },
    [sections]
  );

  const onApply = React.useCallback(
    (message: Extract<ChatTurnMessage, { kind: "proposal" }>, opts: { force?: boolean } = {}) => {
      const current = findParagraphText(message.target.sectionId, message.target.paragraphId);
      if (current === null) {
        ToastBus.push({ message: "That paragraph no longer exists." });
        return;
      }
      if (!opts.force && normalize(current) !== normalize(message.oldText)) {
        // Stale — let the user confirm via the second click.
        ToastBus.push({
          message:
            "You've edited this paragraph since the suggestion. Click Apply again to overwrite.",
        });
        // Mark this proposal stale in local state so the button label updates.
        setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, _stale: true } : m)));
        return;
      }
      onApplyProposal({
        sectionId: message.target.sectionId,
        paragraphId: message.target.paragraphId,
        newText: message.newText,
      });
      // Mark the message applied locally so the UI updates immediately.
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, appliedAt: new Date().toISOString() } : m))
      );
      // Set up the undo pill for ~10s.
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      setUndo({
        sectionId: message.target.sectionId,
        paragraphId: message.target.paragraphId,
        before: current,
        label: message.target.headingDisplay ?? "this paragraph",
      });
      undoTimerRef.current = setTimeout(() => setUndo(null), 10_000);
      void recordAction(message.id, "applied", {
        sectionId: message.target.sectionId,
        paragraphId: message.target.paragraphId,
        before: current,
        after: message.newText,
      });
    },
    [findParagraphText, onApplyProposal, recordAction]
  );

  const onSkip = React.useCallback(
    (message: Extract<ChatTurnMessage, { kind: "proposal" }>) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, dismissedAt: new Date().toISOString() } : m))
      );
      void recordAction(message.id, "dismissed");
    },
    [recordAction]
  );

  const onTryAnother = React.useCallback(
    async (message: Extract<ChatTurnMessage, { kind: "proposal" }>) => {
      // Fire a fresh user turn that asks for another take, scoped to the
      // same paragraph. The teacher can refine wording afterwards.
      const targetLabel = message.target.headingDisplay
        ? `${message.target.headingDisplay} paragraph`
        : "that paragraph";
      const nudge = `Try another rewrite for ${targetLabel} — keep the same facts but a different angle.`;
      setPinnedTarget({
        ref: { sectionId: message.target.sectionId, paragraphId: message.target.paragraphId },
        label: targetLabel,
      });
      setInput(nudge);
      requestAnimationFrame(() => textareaRef.current?.focus());
      void recordAction(message.id, "regenerated");
    },
    [recordAction]
  );

  const onUndo = React.useCallback(() => {
    if (!undo) return;
    onApplyProposal({
      sectionId: undo.sectionId,
      paragraphId: undo.paragraphId,
      newText: undo.before,
    });
    ToastBus.push({ message: "Reverted." });
    setUndo(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, [undo, onApplyProposal]);

  const onChipClick = React.useCallback((chip: ChatChip) => {
    setInput(chip.prefill);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const onPullIn = React.useCallback(
    (message: Extract<ChatTurnMessage, { kind: "obs-ref" }>) => {
      if (!onPullObservation) {
        ToastBus.push({ message: "Pulling observations isn't wired up here." });
        return;
      }
      onPullObservation({
        text: message.obs.quote,
        suggestedTarget: message.suggestedTarget,
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, appliedAt: new Date().toISOString() } : m))
      );
      void recordAction(message.id, "applied");
    },
    [onPullObservation, recordAction]
  );

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

      {undo ? (
        <div className="rd-chat-undo" role="status">
          <Undo2 size={12} strokeWidth={2.5} />
          <span>Applied edit to {undo.label}.</span>
          <button type="button" onClick={onUndo} className="rd-chat-undo-btn">
            Undo
          </button>
        </div>
      ) : null}

      <div className="rd-chat-scroll scroll-quiet" ref={scrollRef}>
        {historyLoaded && messages.length === 0 ? (
          <EmptyState />
        ) : (
          messages.map((m) => (
            <MessageView
              key={m.id}
              message={m}
              onApply={onApply}
              onSkip={onSkip}
              onTryAnother={onTryAnother}
              onChipClick={onChipClick}
              onPullIn={onPullIn}
            />
          ))
        )}
        {sending ? <ThinkingIndicator /> : null}
      </div>

      <div className="rd-composer-wrap">
        {pinnedTarget ? (
          <div className="rd-target-chip">
            <span className="rd-label-cap">About</span>
            <span className="rd-target-chip-label">{pinnedTarget.label}</span>
            <button
              type="button"
              className="rd-target-chip-close"
              onClick={() => setPinnedTarget(null)}
              aria-label="Clear target scope"
            >
              <X size={11} strokeWidth={2.5} />
            </button>
          </div>
        ) : null}
        {pendingAttachments.length > 0 ? (
          <div className="rd-attachments" aria-label="Attached photos">
            {pendingAttachments.map((a) => (
              <span key={a.artifactId} className="rd-attachment">
                <span className="rd-attachment-thumb" aria-hidden="true">
                  📷
                </span>
                <span>Photo</span>
                <button
                  type="button"
                  className="rd-attachment-remove"
                  onClick={() => removeAttachment(a.artifactId)}
                  aria-label="Remove attachment"
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        {cameraSession ? (
          <div className="rd-camera" aria-label="Camera viewfinder">
            <video ref={videoRef} autoPlay playsInline muted />
            <div className="rd-camera-actions">
              <button
                type="button"
                className="rd-btn rd-btn-primary"
                onClick={() => void captureAndAttach()}
                disabled={
                  cameraStatus === "capturing" ||
                  cameraStatus === "ocr" ||
                  cameraStatus === "uploading"
                }
              >
                {cameraStatus === "capturing"
                  ? "Capturing…"
                  : cameraStatus === "ocr"
                    ? "Reading text…"
                    : cameraStatus === "uploading"
                      ? "Uploading…"
                      : "Capture"}
              </button>
              <button
                type="button"
                className="rd-btn rd-btn-ghost"
                onClick={closeCamera}
                disabled={cameraStatus === "uploading"}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        {cameraError ? (
          <div className="rd-camera-progress" role="alert">
            {cameraError}
          </div>
        ) : null}
        <div className="rd-composer">
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder={
              pinnedTarget
                ? `Ask the assistant to refine ${pinnedTarget.label}…`
                : "Ask the assistant to refine this report…"
            }
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
              className="rd-icon-btn"
              title={cameraSession ? "Close camera" : "Attach a photo"}
              aria-label="Attach a photo"
              onClick={() => (cameraSession ? closeCamera() : void openCamera())}
              disabled={cameraStatus === "opening" || cameraStatus === "uploading"}
            >
              <Camera size={16} strokeWidth={2} />
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
});

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

type MessageViewProps = {
  message: ChatMessage & { _stale?: boolean };
  onApply: (m: Extract<ChatTurnMessage, { kind: "proposal" }>, opts?: { force?: boolean }) => void;
  onSkip: (m: Extract<ChatTurnMessage, { kind: "proposal" }>) => void;
  onTryAnother: (m: Extract<ChatTurnMessage, { kind: "proposal" }>) => void;
  onChipClick: (chip: ChatChip) => void;
  onPullIn: (m: Extract<ChatTurnMessage, { kind: "obs-ref" }>) => void;
};

function MessageView({
  message,
  onApply,
  onSkip,
  onTryAnother,
  onChipClick,
  onPullIn,
}: MessageViewProps) {
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
  if (message.kind === "proposal") {
    return (
      <ProposalView
        message={message}
        stale={!!message._stale}
        onApply={onApply}
        onSkip={onSkip}
        onTryAnother={onTryAnother}
      />
    );
  }
  if (message.kind === "chips") {
    return <ChipsView message={message} onChipClick={onChipClick} />;
  }
  if (message.kind === "obs-ref") {
    return <ObsRefView message={message} onPullIn={onPullIn} />;
  }
  if (message.kind === "ghost-edit") {
    return <GhostEditConfirmationView message={message} />;
  }
  // prose | clarify
  return (
    <div className="rd-msg rd-msg-ai">
      <div className="rd-avatar">
        <SparkleGlyph size={12} />
      </div>
      <div className="rd-body">{message.body}</div>
    </div>
  );
}

function ChipsView({
  message,
  onChipClick,
}: {
  message: Extract<ChatTurnMessage, { kind: "chips" }>;
  onChipClick: (chip: ChatChip) => void;
}) {
  return (
    <div className="rd-msg rd-msg-ai">
      <div className="rd-avatar">
        <SparkleGlyph size={12} />
      </div>
      <div className="rd-body">
        {message.body}
        <div className="rd-reply-chips">
          {message.chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className="rd-reply-chip"
              onClick={() => onChipClick(chip)}
              title={chip.prefill}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ObsRefView({
  message,
  onPullIn,
}: {
  message: Extract<ChatTurnMessage, { kind: "obs-ref" }>;
  onPullIn: (m: Extract<ChatTurnMessage, { kind: "obs-ref" }>) => void;
}) {
  const applied = !!message.appliedAt;
  const dismissed = !!message.dismissedAt;
  return (
    <div className="rd-msg rd-msg-ai">
      <div className="rd-avatar">
        <SparkleGlyph size={12} />
      </div>
      <div className="rd-body">
        {message.body}
        <div className="rd-obs-ref" data-applied={applied} data-dismissed={dismissed}>
          <div className="rd-obs-thumb" aria-hidden="true">
            📷
          </div>
          <div className="rd-obs-meta">
            <div className="rd-obs-when">
              {message.obs.when}
              {message.obs.area ? ` · ${message.obs.area}` : ""}
            </div>
            <div className="rd-obs-text">{`"${message.obs.quote}"`}</div>
          </div>
          {applied ? (
            <span className="rd-applied-pill">
              <Check size={12} strokeWidth={2.5} />
              Pulled in
            </span>
          ) : (
            <button
              type="button"
              className="rd-obs-pull"
              onClick={() => onPullIn(message)}
              disabled={dismissed}
            >
              <Plus size={11} strokeWidth={2.5} style={{ marginRight: 3 }} />
              Pull in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function GhostEditConfirmationView({
  message,
}: {
  message: Extract<ChatTurnMessage, { kind: "ghost-edit" }>;
}) {
  return (
    <div className="rd-msg rd-msg-ai">
      <div className="rd-avatar">
        <SparkleGlyph size={12} />
      </div>
      <div className="rd-body">
        {message.body}
        <div className="rd-ghost-confirm">
          <span className="rd-label-cap">Suggested addition</span>
          <span className="rd-ghost-confirm-source">{message.ghostEdit.sourceLabel}</span>
        </div>
      </div>
    </div>
  );
}

function ProposalView({
  message,
  stale,
  onApply,
  onSkip,
  onTryAnother,
}: {
  message: Extract<ChatTurnMessage, { kind: "proposal" }>;
  stale: boolean;
  onApply: (m: Extract<ChatTurnMessage, { kind: "proposal" }>, opts?: { force?: boolean }) => void;
  onSkip: (m: Extract<ChatTurnMessage, { kind: "proposal" }>) => void;
  onTryAnother: (m: Extract<ChatTurnMessage, { kind: "proposal" }>) => void;
}) {
  const applied = !!message.appliedAt;
  const dismissed = !!message.dismissedAt;
  const targetLabel = message.target.headingDisplay
    ? `${message.target.headingDisplay} paragraph`
    : "this paragraph";
  return (
    <div className="rd-msg rd-msg-ai">
      <div className="rd-avatar">
        <SparkleGlyph size={12} />
      </div>
      <div className="rd-body">
        {message.lead}
        <div className="rd-proposal" data-applied={applied} data-dismissed={dismissed}>
          <div className="rd-proposal-head">
            <span className="rd-label-cap">Suggested rewrite</span>
            <span className="rd-target">&rarr; {targetLabel}</span>
          </div>
          <div className="rd-proposal-body">
            <div className="rd-old">{message.oldText}</div>
            <div className="rd-new">{message.newText}</div>
            {message.rationale ? <div className="rd-rationale">{message.rationale}</div> : null}
          </div>
          <ProposalActions
            applied={applied}
            dismissed={dismissed}
            stale={stale}
            onApply={() => onApply(message, { force: stale })}
            onSkip={() => onSkip(message)}
            onTryAnother={() => onTryAnother(message)}
          />
        </div>
      </div>
    </div>
  );
}

function ProposalActions({
  applied,
  dismissed,
  stale,
  onApply,
  onSkip,
  onTryAnother,
}: {
  applied: boolean;
  dismissed: boolean;
  stale: boolean;
  onApply: () => void;
  onSkip: () => void;
  onTryAnother: () => void;
}) {
  if (applied) {
    return (
      <div className="rd-proposal-actions">
        <span className="rd-applied-pill">
          <Check size={12} strokeWidth={2.5} />
          Applied
        </span>
      </div>
    );
  }
  if (dismissed) {
    return (
      <div className="rd-proposal-actions">
        <span className="rd-dismissed-pill">Dismissed</span>
      </div>
    );
  }
  return (
    <div className="rd-proposal-actions">
      <button type="button" className="rd-btn rd-btn-primary" onClick={onApply}>
        <Check size={12} strokeWidth={2.5} />
        {stale ? "Apply anyway" : "Apply edit"}
      </button>
      <button type="button" className="rd-btn rd-btn-ghost" onClick={onSkip}>
        Skip
      </button>
      <button
        type="button"
        className="rd-btn rd-btn-ghost"
        onClick={onTryAnother}
        style={{ marginLeft: "auto" }}
      >
        <RotateCcw size={12} strokeWidth={2} />
        Try another
      </button>
    </div>
  );
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// Re-export the target type so callers don't have to import from schemas.
export type { ChatProposalTarget };
