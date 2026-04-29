"use client";

import * as React from "react";
import { Mic, Square, Play, Pause, RotateCcw, Check, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

/**
 * AudioCapture — in-app voice memo capture for the agent flow.
 * Strictly getUserMedia + MediaRecorder, no <input type="file">
 * fallback. Audio captured here flows from the browser to
 * /api/montessori/agent/interpret in memory and is never written to
 * the teacher's device.
 *
 * Flow: open → request mic permission → arm → record → stop → review
 * (play back / scrub) → either retake (resets the buffer) or use
 * (hand the Blob to the parent's onCapture). The parent closes the
 * dialog, which fires the cleanup effect that stops tracks and
 * revokes any Object URLs.
 *
 * Hard cap of 5 minutes per recording to stay well under the
 * backend's 25 MB multipart cap and to keep Gemini latency
 * reasonable.
 */

const MAX_DURATION_MS = 5 * 60 * 1000;

export interface AudioCaptureProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCapture: (blob: Blob, mimeType: string) => void;
}

type Status = "idle" | "starting" | "armed" | "recording" | "review" | "denied" | "unsupported" | "error";

export function AudioCapture({ open, onOpenChange, onCapture }: AudioCaptureProps) {
    const streamRef = React.useRef<MediaStream | null>(null);
    const recorderRef = React.useRef<MediaRecorder | null>(null);
    const chunksRef = React.useRef<Blob[]>([]);
    const startTimeRef = React.useRef<number>(0);
    const tickerRef = React.useRef<number | null>(null);
    const stopTimeoutRef = React.useRef<number | null>(null);
    const audioRef = React.useRef<HTMLAudioElement>(null);

    const [status, setStatus] = React.useState<Status>("idle");
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
    const [elapsedMs, setElapsedMs] = React.useState(0);
    const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
    const [isPlaying, setIsPlaying] = React.useState(false);
    const previewBlobRef = React.useRef<{ blob: Blob; mimeType: string } | null>(null);

    const teardown = React.useCallback(() => {
        if (recorderRef.current && recorderRef.current.state !== "inactive") {
            try {
                recorderRef.current.stop();
            } catch {
                /* swallow — best-effort teardown */
            }
        }
        recorderRef.current = null;

        if (streamRef.current) {
            for (const track of streamRef.current.getTracks()) track.stop();
            streamRef.current = null;
        }

        if (tickerRef.current !== null) {
            window.clearInterval(tickerRef.current);
            tickerRef.current = null;
        }
        if (stopTimeoutRef.current !== null) {
            window.clearTimeout(stopTimeoutRef.current);
            stopTimeoutRef.current = null;
        }
    }, []);

    const arm = React.useCallback(async () => {
        setErrorMessage(null);
        setStatus("starting");
        chunksRef.current = [];

        if (
            typeof navigator === "undefined" ||
            !navigator.mediaDevices?.getUserMedia ||
            typeof MediaRecorder === "undefined"
        ) {
            setStatus("unsupported");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            streamRef.current = stream;
            setStatus("armed");
        } catch (err) {
            const name = (err as { name?: string })?.name;
            if (name === "NotAllowedError" || name === "SecurityError") {
                setStatus("denied");
            } else {
                setStatus("error");
                setErrorMessage(
                    name === "NotFoundError"
                        ? "No microphone was found on this device."
                        : "Couldn't start the microphone. Please try again."
                );
            }
        }
    }, []);

    const startRecording = React.useCallback(() => {
        const stream = streamRef.current;
        if (!stream) return;

        // Pick a mimeType the browser actually supports. Chrome/Firefox
        // ship Opus-in-WebM; Safari only does AAC-in-MP4. Gemini
        // accepts both.
        const candidates = [
            "audio/webm;codecs=opus",
            "audio/webm",
            "audio/mp4;codecs=mp4a.40.2",
            "audio/mp4",
        ];
        const mimeType =
            candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? "";

        let recorder: MediaRecorder;
        try {
            recorder = mimeType
                ? new MediaRecorder(stream, { mimeType })
                : new MediaRecorder(stream);
        } catch {
            setStatus("error");
            setErrorMessage("This browser can't record audio in a supported format.");
            return;
        }
        recorderRef.current = recorder;
        chunksRef.current = [];

        recorder.addEventListener("dataavailable", (e) => {
            if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
        });
        recorder.addEventListener("stop", () => {
            const finalMime = recorder.mimeType || mimeType || "audio/webm";
            const blob = new Blob(chunksRef.current, { type: finalMime });
            chunksRef.current = [];

            if (previewUrl) URL.revokeObjectURL(previewUrl);
            const url = URL.createObjectURL(blob);
            previewBlobRef.current = { blob, mimeType: finalMime };
            setPreviewUrl(url);
            setStatus("review");
            if (tickerRef.current !== null) {
                window.clearInterval(tickerRef.current);
                tickerRef.current = null;
            }
        });

        recorder.start(250);
        startTimeRef.current = performance.now();
        setElapsedMs(0);
        setStatus("recording");

        tickerRef.current = window.setInterval(() => {
            const ms = performance.now() - startTimeRef.current;
            setElapsedMs(ms);
        }, 100);

        // Auto-stop at the cap so a forgotten recording can't blow up
        // the upload payload.
        stopTimeoutRef.current = window.setTimeout(() => {
            if (recorderRef.current && recorderRef.current.state === "recording") {
                recorderRef.current.stop();
            }
        }, MAX_DURATION_MS);
    }, [previewUrl]);

    const stopRecording = React.useCallback(() => {
        const rec = recorderRef.current;
        if (rec && rec.state === "recording") {
            rec.stop();
        }
        if (stopTimeoutRef.current !== null) {
            window.clearTimeout(stopTimeoutRef.current);
            stopTimeoutRef.current = null;
        }
    }, []);

    // Open / close lifecycle.
    React.useEffect(() => {
        if (open) {
            void arm();
        } else {
            teardown();
            setStatus("idle");
            setErrorMessage(null);
            setElapsedMs(0);
            setIsPlaying(false);
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
                setPreviewUrl(null);
            }
            previewBlobRef.current = null;
        }
        return () => {
            teardown();
        };
    }, [open, arm, teardown, previewUrl]);

    const retake = React.useCallback(() => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        previewBlobRef.current = null;
        setIsPlaying(false);
        // Stream is still alive — just go back to armed and let the
        // teacher hit record again without re-prompting for permission.
        setStatus("armed");
    }, [previewUrl]);

    const accept = React.useCallback(() => {
        const captured = previewBlobRef.current;
        if (!captured) return;
        onCapture(captured.blob, captured.mimeType);
        onOpenChange(false);
    }, [onCapture, onOpenChange]);

    const togglePlayback = React.useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (audio.paused) {
            void audio.play();
            setIsPlaying(true);
        } else {
            audio.pause();
            setIsPlaying(false);
        }
    }, []);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Record a voice note</DialogTitle>
                    <DialogDescription>
                        Talk through what happened. The recording stays inside the app — nothing is
                        saved to your device.
                    </DialogDescription>
                </DialogHeader>

                <div className="rounded-lg border border-stroke-subtle bg-canvas-base p-6 flex flex-col items-center gap-3">
                    {status === "starting" && (
                        <Message icon={<Mic className="h-6 w-6 text-ink-secondary" />}>
                            Asking for microphone permission…
                        </Message>
                    )}

                    {status === "armed" && (
                        <Message icon={<Mic className="h-6 w-6 text-ink-secondary" />}>
                            Ready when you are.
                        </Message>
                    )}

                    {status === "recording" && (
                        <div className="flex flex-col items-center gap-2">
                            <div className="relative h-14 w-14 rounded-full bg-status-error flex items-center justify-center">
                                <span className="absolute inset-0 rounded-full bg-status-error/40 animate-ping" />
                                <Mic className="h-6 w-6 text-white relative z-10" />
                            </div>
                            <div className="font-mono text-lg text-ink-primary">
                                {formatDuration(elapsedMs)}
                            </div>
                            <div className="text-xs text-ink-tertiary">
                                Auto-stops at {formatDuration(MAX_DURATION_MS)}
                            </div>
                        </div>
                    )}

                    {status === "review" && previewUrl && (
                        <div className="w-full flex flex-col items-center gap-2">
                            {/* Hidden native audio element drives playback —
                                we control the toggle ourselves so the look
                                matches the rest of the app. */}
                            <audio
                                ref={audioRef}
                                src={previewUrl}
                                onEnded={() => setIsPlaying(false)}
                                onPause={() => setIsPlaying(false)}
                                preload="metadata"
                                className="hidden"
                            />
                            <Button variant="outline" size="sm" onClick={togglePlayback}>
                                {isPlaying ? (
                                    <>
                                        <Pause className="h-4 w-4 mr-2" />
                                        Pause
                                    </>
                                ) : (
                                    <>
                                        <Play className="h-4 w-4 mr-2" />
                                        Play back
                                    </>
                                )}
                            </Button>
                            <div className="text-xs text-ink-tertiary">
                                {formatDuration(elapsedMs)} captured
                            </div>
                        </div>
                    )}

                    {status === "denied" && (
                        <Message icon={<AlertTriangle className="h-6 w-6 text-status-warning" />}>
                            Microphone permission was blocked. Allow microphone access in your
                            browser settings, then reopen this dialog.
                        </Message>
                    )}
                    {status === "unsupported" && (
                        <Message icon={<AlertTriangle className="h-6 w-6 text-status-warning" />}>
                            This browser doesn't support in-app audio capture. Please use a recent
                            mobile browser.
                        </Message>
                    )}
                    {status === "error" && (
                        <Message icon={<AlertTriangle className="h-6 w-6 text-status-error" />}>
                            {errorMessage ?? "Recording error."}
                        </Message>
                    )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <p className="text-xs text-ink-tertiary max-w-xs">
                        For child privacy, recordings are processed by the agent and removed from
                        the server immediately after.
                    </p>
                    <div className="flex items-center gap-2">
                        {status === "armed" && (
                            <Button onClick={startRecording}>
                                <Mic className="h-4 w-4 mr-2" />
                                Start recording
                            </Button>
                        )}
                        {status === "recording" && (
                            <Button variant="outline" onClick={stopRecording}>
                                <Square className="h-4 w-4 mr-2" />
                                Stop
                            </Button>
                        )}
                        {status === "review" && (
                            <>
                                <Button variant="outline" onClick={retake}>
                                    <RotateCcw className="h-4 w-4 mr-2" />
                                    Retake
                                </Button>
                                <Button onClick={accept}>
                                    <Check className="h-4 w-4 mr-2" />
                                    Use this recording
                                </Button>
                            </>
                        )}
                        {(status === "denied" || status === "error" || status === "unsupported") && (
                            <Button variant="outline" onClick={() => void arm()}>
                                Try again
                            </Button>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ─── Internal ───────────────────────────────────────────────────────

function Message({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="text-center text-ink-secondary text-sm space-y-2 max-w-sm">
            <div className="flex justify-center">{icon}</div>
            <div>{children}</div>
        </div>
    );
}

function formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}
