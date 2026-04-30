"use client";

import * as React from "react";
import { Camera, RotateCcw, Check, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

/**
 * PhotoCapture — in-app photo capture for physical documents
 * (handwritten notes, worksheets, whiteboards). Strictly getUserMedia
 * with no file input fallback. Photos taken here never sit on the
 * teacher's camera roll — the bytes flow straight from the browser
 * to /api/montessori/agent/interpret in memory.
 *
 * Flow: open → request camera permission → live preview → snap →
 * review → either retake (resume the stream) or use (hand the Blob
 * to the parent). The parent is responsible for sending the blob to
 * the agent endpoint and discarding it after the response.
 *
 * Mobile-first: defaults to the rear camera (`facingMode:
 * "environment"`) so a teacher pointing at a piece of paper or a
 * whiteboard gets the right lens. Falls through to whatever camera
 * the device exposes if the rear lens is unavailable.
 */

export interface PhotoCaptureProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCapture: (blob: Blob, mimeType: string) => void;
}

type Status = "idle" | "starting" | "live" | "review" | "denied" | "unsupported" | "error";

export function PhotoCapture({ open, onOpenChange, onCapture }: PhotoCaptureProps) {
    const videoRef = React.useRef<HTMLVideoElement>(null);
    const streamRef = React.useRef<MediaStream | null>(null);
    const [status, setStatus] = React.useState<Status>("idle");
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
    const previewBlobRef = React.useRef<{ blob: Blob; mimeType: string } | null>(null);
    // Mirror of previewUrl for cleanup paths that mustn't run on every
    // preview change. The lifecycle effect below reads this ref so
    // that snapping a frame doesn't re-trigger start() and bounce the
    // dialog back to the live camera state.
    const previewUrlRef = React.useRef<string | null>(null);
    React.useEffect(() => {
        previewUrlRef.current = previewUrl;
    }, [previewUrl]);

    const teardown = React.useCallback(() => {
        if (streamRef.current) {
            for (const track of streamRef.current.getTracks()) track.stop();
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, []);

    const start = React.useCallback(async () => {
        setErrorMessage(null);
        setStatus("starting");

        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
            setStatus("unsupported");
            return;
        }

        try {
            // Prefer the rear camera for documents; fall back to any
            // camera if the constraint can't be satisfied (most
            // laptops only have a front-facing webcam).
            let stream: MediaStream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: "environment" } },
                    audio: false,
                });
            } catch {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: false,
                });
            }
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play().catch(() => {
                    /* autoplay can throw on iOS until user-gesture; the
                     * Dialog open IS a user gesture so this is normally
                     * fine, but we swallow to avoid a noisy reject. */
                });
            }
            setStatus("live");
        } catch (err) {
            const name = (err as { name?: string })?.name;
            if (name === "NotAllowedError" || name === "SecurityError") {
                setStatus("denied");
            } else {
                setStatus("error");
                setErrorMessage(
                    name === "NotFoundError"
                        ? "No camera was found on this device."
                        : "Couldn't start the camera. Please try again."
                );
            }
        }
    }, []);

    // Open / close lifecycle. Intentionally does NOT depend on
    // previewUrl — re-running this effect mid-session would restart
    // the camera and clobber the review state the moment Capture
    // creates a still preview.
    React.useEffect(() => {
        if (open) {
            void start();
        } else {
            teardown();
            setStatus("idle");
            setErrorMessage(null);
            if (previewUrlRef.current) {
                URL.revokeObjectURL(previewUrlRef.current);
                setPreviewUrl(null);
            }
            previewBlobRef.current = null;
        }
        return () => {
            teardown();
        };
    }, [open, start, teardown]);

    const snap = React.useCallback(async () => {
        const video = videoRef.current;
        if (!video || video.readyState < 2) return;

        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const mimeType = "image/jpeg";
        const blob: Blob | null = await new Promise((resolve) =>
            canvas.toBlob((b) => resolve(b), mimeType, 0.9)
        );
        if (!blob) {
            setStatus("error");
            setErrorMessage("Couldn't capture the frame. Please try again.");
            return;
        }

        if (previewUrl) URL.revokeObjectURL(previewUrl);
        const url = URL.createObjectURL(blob);
        previewBlobRef.current = { blob, mimeType };
        setPreviewUrl(url);
        setStatus("review");

        // Pause the live tracks while the user reviews — saves battery
        // on mobile and is the right intuition (the preview is a
        // still, not a frozen video).
        if (streamRef.current) {
            for (const track of streamRef.current.getTracks()) track.enabled = false;
        }
    }, [previewUrl]);

    const retake = React.useCallback(() => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        previewBlobRef.current = null;
        if (streamRef.current) {
            for (const track of streamRef.current.getTracks()) track.enabled = true;
        }
        setStatus("live");
    }, [previewUrl]);

    const accept = React.useCallback(() => {
        const captured = previewBlobRef.current;
        if (!captured) return;
        onCapture(captured.blob, captured.mimeType);
        // Parent decides what to do next — in practice it'll close
        // the dialog, which fires the cleanup effect above.
        onOpenChange(false);
    }, [onCapture, onOpenChange]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl p-0 overflow-hidden">
                <DialogHeader className="px-6 pt-6">
                    <DialogTitle>Capture a photo</DialogTitle>
                    <DialogDescription>
                        Point the camera at the page or whiteboard. The photo stays inside the app
                        — nothing is saved to your camera roll.
                    </DialogDescription>
                </DialogHeader>

                <div className="relative bg-black aspect-video w-full overflow-hidden">
                    {/* The <video> stays mounted across status changes
                        so the stream attaches to it on first start. */}
                    <video
                        ref={videoRef}
                        playsInline
                        muted
                        className={
                            "h-full w-full object-cover " +
                            (status === "live" ? "block" : "hidden")
                        }
                    />
                    {status === "review" && previewUrl && (
                        // Native <img> intentional — Object URL preview
                        // doesn't benefit from next/image optimisation.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={previewUrl}
                            alt="Captured frame for review"
                            className="h-full w-full object-cover"
                        />
                    )}
                    {(status === "idle" || status === "starting") && (
                        <CenteredMessage icon={<Camera className="h-6 w-6 text-ink-secondary" />}>
                            {status === "starting" ? "Starting camera…" : "Camera not started"}
                        </CenteredMessage>
                    )}
                    {status === "denied" && (
                        <CenteredMessage
                            icon={<AlertTriangle className="h-6 w-6 text-status-warning" />}
                        >
                            Camera permission was blocked. Allow camera access in your browser
                            settings, then reopen this dialog.
                        </CenteredMessage>
                    )}
                    {status === "unsupported" && (
                        <CenteredMessage
                            icon={<AlertTriangle className="h-6 w-6 text-status-warning" />}
                        >
                            This browser doesn't support in-app camera capture. Please use a recent
                            mobile browser.
                        </CenteredMessage>
                    )}
                    {status === "error" && (
                        <CenteredMessage
                            icon={<AlertTriangle className="h-6 w-6 text-status-error" />}
                        >
                            {errorMessage ?? "Camera error."}
                        </CenteredMessage>
                    )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-stroke-subtle">
                    <p className="text-xs text-ink-tertiary max-w-xs">
                        For child privacy, photos are processed by the agent and removed from the
                        server immediately after.
                    </p>
                    <div className="flex items-center gap-2">
                        {status === "live" && (
                            <Button onClick={snap}>
                                <Camera className="h-4 w-4 mr-2" />
                                Capture
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
                                    Use this photo
                                </Button>
                            </>
                        )}
                        {(status === "denied" || status === "error" || status === "unsupported") && (
                            <Button variant="outline" onClick={() => void start()}>
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

function CenteredMessage({
    icon,
    children,
}: {
    icon: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-ink-secondary text-sm max-w-sm px-6 space-y-2">
                <div className="flex justify-center">{icon}</div>
                <div>{children}</div>
            </div>
        </div>
    );
}
