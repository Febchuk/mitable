"use client";

import * as React from "react";
import { Camera, Mic, Send, Image as ImageIcon, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useInterpretCapture } from "@/lib/query/montessoriMutations";
import { enqueueCapture } from "@/lib/offline/captureQueue";
import { useOnlineStatus } from "@/lib/offline/useOnlineStatus";
import type { ProposedUpdatesEnvelope } from "@/types/proposed-updates";
import type { Role } from "@/types";

import { AudioCapture } from "./AudioCapture";
import { PhotoCapture } from "./PhotoCapture";
import { ProposalReviewPanel } from "./ProposalReviewPanel";

/**
 * AgentView — the chat-style capture surface for teachers.
 *
 * One textarea, two media buttons (Photo, Voice), one send button.
 * Bytes from PhotoCapture / AudioCapture are held in memory only for
 * the lifetime of a pending message; on send they go to /interpret as
 * multipart and are dropped on the client side immediately. The
 * server drops them as soon as Gemini's response parses.
 *
 * The review-and-confirm UI for the returned proposals is deliberately
 * minimal in this commit — that's the focus of 4.1. Here we just show
 * the agent's plain-language summary and any clarifying question so
 * the end-to-end loop is reachable.
 */

export interface AgentViewProps {
    role: Role;
}

interface PendingMedia {
    blob: Blob;
    mimeType: string;
    /** Object URL for the on-screen chip. Revoked when media is cleared
     *  or replaced. */
    previewUrl: string;
}

interface ChatTurn {
    id: string;
    role: "user" | "agent" | "system";
    text: string;
    /** Only set on agent turns. The proposal cards read the editable
     *  envelope from here. */
    envelope?: ProposedUpdatesEnvelope;
    attachment?: { kind: "photo" | "audio" };
}

const TOOLTIP_DISMISSED_KEY = "mitable.montessori.agent.captureTipDismissed";

export function AgentView({ role: _role }: AgentViewProps) {
    const [text, setText] = React.useState("");
    const [photo, setPhoto] = React.useState<PendingMedia | null>(null);
    const [audio, setAudio] = React.useState<PendingMedia | null>(null);
    const [photoOpen, setPhotoOpen] = React.useState(false);
    const [audioOpen, setAudioOpen] = React.useState(false);
    const [threadId, setThreadId] = React.useState<string | null>(null);
    const [turns, setTurns] = React.useState<ChatTurn[]>([]);
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
    const scrollerRef = React.useRef<HTMLDivElement>(null);

    const interpret = useInterpretCapture();
    const online = useOnlineStatus();

    // First-time tooltip — shown until the teacher dismisses it once.
    // Stored in localStorage so it doesn't reappear across sessions.
    const [showTooltip, setShowTooltip] = React.useState(false);
    React.useEffect(() => {
        if (typeof window === "undefined") return;
        const dismissed = window.localStorage.getItem(TOOLTIP_DISMISSED_KEY);
        if (!dismissed) setShowTooltip(true);
    }, []);
    const dismissTooltip = React.useCallback(() => {
        if (typeof window !== "undefined") {
            window.localStorage.setItem(TOOLTIP_DISMISSED_KEY, "1");
        }
        setShowTooltip(false);
    }, []);

    // Auto-scroll to the bottom on new turns.
    React.useEffect(() => {
        const el = scrollerRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [turns.length, interpret.isPending]);

    const setPhotoMedia = React.useCallback(
        (blob: Blob, mimeType: string) => {
            if (photo) URL.revokeObjectURL(photo.previewUrl);
            setPhoto({ blob, mimeType, previewUrl: URL.createObjectURL(blob) });
        },
        [photo]
    );

    const setAudioMedia = React.useCallback(
        (blob: Blob, mimeType: string) => {
            if (audio) URL.revokeObjectURL(audio.previewUrl);
            setAudio({ blob, mimeType, previewUrl: URL.createObjectURL(blob) });
        },
        [audio]
    );

    const clearPhoto = React.useCallback(() => {
        if (photo) URL.revokeObjectURL(photo.previewUrl);
        setPhoto(null);
    }, [photo]);

    const clearAudio = React.useCallback(() => {
        if (audio) URL.revokeObjectURL(audio.previewUrl);
        setAudio(null);
    }, [audio]);

    // Revoke any lingering Object URLs on unmount.
    React.useEffect(() => {
        return () => {
            if (photo) URL.revokeObjectURL(photo.previewUrl);
            if (audio) URL.revokeObjectURL(audio.previewUrl);
        };
    }, [photo, audio]);

    const canSend =
        !interpret.isPending && (text.trim().length > 0 || photo !== null || audio !== null);

    const handleSend = React.useCallback(async () => {
        if (!canSend) return;
        setErrorMessage(null);

        const trimmed = text.trim();
        const localUserTurn: ChatTurn = {
            id: `local-${Date.now()}`,
            role: "user",
            text: trimmed || (photo ? "(photo)" : audio ? "(voice note)" : ""),
            attachment: photo ? { kind: "photo" } : audio ? { kind: "audio" } : undefined,
        };
        setTurns((prev) => [...prev, localUserTurn]);

        // Stash the media so we can release the chips immediately and
        // the upload still has the bytes. Setting state to null here
        // lets the user start composing a follow-up while interpret is
        // in flight.
        const photoForUpload = photo ? { blob: photo.blob, mimeType: photo.mimeType } : null;
        const audioForUpload = audio ? { blob: audio.blob, mimeType: audio.mimeType } : null;
        setText("");
        clearPhoto();
        clearAudio();

        // Offline path: skip the request entirely and persist the
        // capture so 6.3's drain can re-submit it on reconnect.
        // We surface a system-style turn so the teacher knows the
        // capture is safe and *will* turn into a draft later — never
        // auto-saved.
        if (!online) {
            try {
                await enqueueCapture({
                    threadId: threadId ?? null,
                    text: trimmed || null,
                    photo: photoForUpload,
                    audio: audioForUpload,
                });
                setTurns((prev) => [
                    ...prev,
                    {
                        id: `offline-${Date.now()}`,
                        role: "system",
                        text: "You're offline. Saved on this device — we'll draft updates for you to review as soon as you're back online.",
                    },
                ]);
            } catch (err) {
                setErrorMessage(
                    (err as Error)?.message ??
                        "Couldn't save offline. Try again once you're back online."
                );
            }
            return;
        }

        try {
            const result = await interpret.mutateAsync({
                threadId: threadId ?? undefined,
                text: trimmed || null,
                photo: photoForUpload,
                audio: audioForUpload,
            });
            setThreadId(result.threadId);

            const agentText = result.envelope.clarifyingQuestion
                ? `${result.envelope.summary}\n\n${result.envelope.clarifyingQuestion}`
                : result.envelope.summary;
            setTurns((prev) => [
                ...prev,
                {
                    id: result.messageId,
                    role: "agent",
                    text: agentText,
                    envelope: result.envelope,
                },
            ]);
        } catch (err) {
            // Distinguish a network drop (TypeError from fetch) from a
            // server-side failure. The former gets queued so the user
            // doesn't lose work; the latter surfaces as an inline error
            // so they know to fix their input.
            const isNetworkError =
                err instanceof TypeError ||
                (typeof navigator !== "undefined" && !navigator.onLine);

            if (isNetworkError) {
                try {
                    await enqueueCapture({
                        threadId: threadId ?? null,
                        text: trimmed || null,
                        photo: photoForUpload,
                        audio: audioForUpload,
                    });
                    setTurns((prev) => [
                        ...prev,
                        {
                            id: `offline-${Date.now()}`,
                            role: "system",
                            text: "Network dropped before we could reach the agent. Saved on this device — we'll draft updates for you to review when the connection is back.",
                        },
                    ]);
                    return;
                } catch {
                    // fall through to the visible error
                }
            }

            setErrorMessage(
                (err as Error)?.message ?? "Couldn't reach the agent. Please try again."
            );
        }
    }, [canSend, text, photo, audio, threadId, interpret, clearPhoto, clearAudio, online]);

    const handleKeyDown = React.useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            // Cmd+Enter / Ctrl+Enter sends. Plain Enter still inserts a
            // newline so a teacher can compose a multi-line note.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handleSend();
            }
        },
        [handleSend]
    );

    return (
        <div className="h-full flex flex-col bg-canvas-base">
            {/* Conversation log */}
            <div ref={scrollerRef} className="flex-1 overflow-y-auto px-6 py-6">
                {turns.length === 0 ? (
                    <EmptyState />
                ) : (
                    <div className="max-w-2xl mx-auto space-y-4">
                        {turns.map((turn) => (
                            <ChatBubble
                                key={turn.id}
                                turn={turn}
                                threadId={threadId}
                            />
                        ))}
                        {interpret.isPending && <PendingBubble />}
                        {errorMessage && (
                            <div className="text-sm text-status-error">{errorMessage}</div>
                        )}
                    </div>
                )}
            </div>

            {/* Composer */}
            <div className="border-t border-stroke-subtle bg-canvas-raised">
                <div className="max-w-2xl mx-auto px-4 py-3 space-y-2">
                    {(photo || audio) && (
                        <div className="flex flex-wrap items-center gap-2">
                            {photo && (
                                <MediaChip
                                    label="Photo attached"
                                    icon={<ImageIcon className="h-3.5 w-3.5" />}
                                    onRemove={clearPhoto}
                                />
                            )}
                            {audio && (
                                <MediaChip
                                    label="Voice note attached"
                                    icon={<Mic className="h-3.5 w-3.5" />}
                                    onRemove={clearAudio}
                                />
                            )}
                        </div>
                    )}

                    <div className="flex items-end gap-2">
                        <div className="relative">
                            <div className="flex items-center gap-1">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Take photo"
                                    onClick={() => {
                                        dismissTooltip();
                                        setPhotoOpen(true);
                                    }}
                                >
                                    <Camera className="h-5 w-5" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Record voice note"
                                    onClick={() => {
                                        dismissTooltip();
                                        setAudioOpen(true);
                                    }}
                                >
                                    <Mic className="h-5 w-5" />
                                </Button>
                            </div>
                            {showTooltip && <CaptureTooltip onDismiss={dismissTooltip} />}
                        </div>
                        <Textarea
                            placeholder="Tell the agent what happened, or attach a photo of your notes…"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            rows={2}
                            className="min-h-[44px] resize-none"
                        />
                        <Button
                            type="button"
                            onClick={() => void handleSend()}
                            disabled={!canSend}
                            aria-label="Send"
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    </div>

                    <p className="text-xs text-ink-tertiary">
                        Photos and recordings stay inside the app. Raw media is deleted from the
                        server immediately after the agent reads it; nothing is saved to your
                        device.
                    </p>
                </div>
            </div>

            <PhotoCapture open={photoOpen} onOpenChange={setPhotoOpen} onCapture={setPhotoMedia} />
            <AudioCapture open={audioOpen} onOpenChange={setAudioOpen} onCapture={setAudioMedia} />
        </div>
    );
}

// ─── Internal pieces ────────────────────────────────────────────────

function EmptyState() {
    return (
        <div className="h-full flex items-center justify-center">
            <div className="max-w-md text-center space-y-3">
                <div className="mx-auto h-10 w-10 rounded-xl border border-accent-border bg-accent-bg flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-accent" />
                </div>
                <h1 className="text-lg font-semibold text-ink-primary">Capture a moment</h1>
                <p className="text-sm text-ink-secondary">
                    Type a quick note, snap a photo of your handwritten observations, or record a
                    voice memo. The agent will draft updates for you to review and approve.
                </p>
            </div>
        </div>
    );
}

function ChatBubble({ turn, threadId }: { turn: ChatTurn; threadId: string | null }) {
    const isUser = turn.role === "user";
    const isSystem = turn.role === "system";

    if (isSystem) {
        return (
            <div className="flex justify-center">
                <div className="rounded-lg border border-stroke-subtle bg-canvas-overlay px-3 py-2 text-xs text-ink-secondary max-w-[90%] text-center">
                    {turn.text}
                </div>
            </div>
        );
    }

    // Agent turns with proposals are wider so the editable cards have
    // room to breathe. The bubble itself becomes a thin frame around
    // the review panel rather than a chat bubble.
    if (!isUser && turn.envelope && turn.envelope.proposals.length > 0 && threadId) {
        return (
            <div className="flex justify-start">
                <div className="w-full max-w-2xl rounded-2xl border border-stroke-subtle bg-canvas-raised p-3 space-y-3">
                    <div className="text-sm text-ink-primary whitespace-pre-wrap">
                        {turn.text}
                    </div>
                    <ProposalReviewPanel
                        threadId={threadId}
                        sourceMessageId={turn.id}
                        envelope={turn.envelope}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className={"flex " + (isUser ? "justify-end" : "justify-start")}>
            <div
                className={
                    "rounded-2xl px-4 py-2.5 max-w-[80%] text-sm whitespace-pre-wrap " +
                    (isUser
                        ? "bg-accent-bg border border-accent-border text-ink-primary"
                        : "bg-canvas-raised border border-stroke-subtle text-ink-primary")
                }
            >
                {turn.attachment && isUser && (
                    <div className="text-xs text-ink-tertiary mb-1 flex items-center gap-1">
                        {turn.attachment.kind === "photo" ? (
                            <ImageIcon className="h-3 w-3" />
                        ) : (
                            <Mic className="h-3 w-3" />
                        )}
                        {turn.attachment.kind === "photo" ? "Photo attached" : "Voice note attached"}
                    </div>
                )}
                <div>{turn.text}</div>
            </div>
        </div>
    );
}

function PendingBubble() {
    return (
        <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-2.5 bg-canvas-raised border border-stroke-subtle text-sm text-ink-tertiary">
                Thinking…
            </div>
        </div>
    );
}

function MediaChip({
    label,
    icon,
    onRemove,
}: {
    label: string;
    icon: React.ReactNode;
    onRemove: () => void;
}) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-stroke-subtle bg-canvas-base px-2.5 py-1 text-xs text-ink-secondary">
            {icon}
            {label}
            <button
                type="button"
                onClick={onRemove}
                className="ml-1 text-ink-tertiary hover:text-ink-primary"
                aria-label={`Remove ${label.toLowerCase()}`}
            >
                <X className="h-3 w-3" />
            </button>
        </span>
    );
}

function CaptureTooltip({ onDismiss }: { onDismiss: () => void }) {
    return (
        <div
            role="status"
            className="absolute bottom-full left-0 mb-2 w-64 rounded-lg border border-stroke-subtle bg-canvas-overlay p-3 shadow-lg text-xs text-ink-secondary"
        >
            <div className="font-medium text-ink-primary mb-1">In-app capture only</div>
            <p className="leading-relaxed">
                Use these to take a photo of your notes or record a voice memo. Capture happens
                inside the app — nothing comes from your camera roll or files.
            </p>
            <button
                type="button"
                onClick={onDismiss}
                className="mt-2 text-accent hover:underline"
            >
                Got it
            </button>
        </div>
    );
}
