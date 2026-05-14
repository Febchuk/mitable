"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startCamera, type CameraSession } from "@/lib/capture/camera-capture";
import { getOcrEngine } from "@/lib/capture/engines";
import { redactPiiFromImage } from "@/lib/capture/redact-image";
import { getDb } from "@/lib/db/schema";
import { decryptRoster } from "@/lib/db/encrypted-fields";
import type { RosterEntry } from "@/lib/capture/tokenize";
import { recordEvent } from "@/lib/telemetry/events";

export interface CameraCapture {
  text: string;
  /** Ephemeral object URL of the redacted image — revoke after use. */
  redactedImageUrl?: string;
  redactedCount: number;
}

export interface CameraButtonProps {
  disabled?: boolean;
  classroomId: string;
  onCapture: (result: CameraCapture) => void;
  onError?: (message: string) => void;
}

type State = "idle" | "loading-model" | "open" | "ocr" | "redacting" | "error";

async function loadRosterForClassroom(classroomId: string): Promise<RosterEntry[]> {
  const db = getDb();
  const enrollments = await db.enrollments.where("classroomId").equals(classroomId).toArray();
  const activeEnrollments = enrollments.filter((e) => e.endDate === null);
  const studentIds = new Set(activeEnrollments.map((e) => e.studentId));
  if (studentIds.size === 0) return [];
  const encryptedStudents = await db.roster.where("id").anyOf([...studentIds]).toArray();
  const decrypted = await Promise.all(encryptedStudents.map((r) => decryptRoster(r)));
  return decrypted.map((s) => ({
    id: s.id,
    name: [s.firstName, s.lastName].filter(Boolean).join(" "),
  }));
}

/**
 * In-app camera capture button. FR-4 forbids gallery imports — we open a live
 * camera stream and snap on user gesture, run OCR through the worker, then
 * redact PII (student names) with solid black boxes on the image. The caller
 * receives the OCR text (for tokenization/LLM) plus an ephemeral redacted
 * image URL (for display only — never uploaded).
 */
export function CameraButton({ disabled, classroomId, onCapture, onError }: CameraButtonProps) {
  const [state, setState] = useState<State>("idle");
  const [hint, setHint] = useState("");
  const sessionRef = useRef<CameraSession | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (state !== "open") return;
    const v = videoRef.current;
    const s = sessionRef.current;
    if (v && s) {
      v.srcObject = s.stream;
      void v.play();
    }
  }, [state]);

  useEffect(() => {
    return () => {
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, []);

  async function open() {
    try {
      recordEvent({ name: "capture_started", mode: "photo" });
      const sess = await startCamera({ facingMode: "environment" });
      sessionRef.current = sess;
      setState("open");
      setHint("");
    } catch (err) {
      const msg = (err as Error).message;
      setState("error");
      setHint(msg);
      onError?.(msg);
      recordEvent({ name: "capture_abandoned", mode: "photo", reason: "permission-denied" });
    }
  }

  function close() {
    sessionRef.current?.stop();
    sessionRef.current = null;
    setState("idle");
    setHint("");
    recordEvent({ name: "capture_abandoned", mode: "photo", reason: "user-cancel" });
  }

  async function snap() {
    const sess = sessionRef.current;
    if (!sess) return;
    setState("ocr");
    setHint("Reading text…");
    const t0 = performance.now();
    try {
      const blob = await sess.capture();
      sess.stop();
      sessionRef.current = null;

      recordEvent({ name: "model_load_started", engine: "ocr" });
      await getOcrEngine().init();
      recordEvent({
        name: "model_load_completed",
        engine: "ocr",
        durationMs: performance.now() - t0,
      });

      const result = await getOcrEngine().recognize(blob);
      const text = result.text.trim();
      if (result.confidence !== undefined && result.confidence < 60) {
        recordEvent({ name: "ocr_confidence_low", confidence: result.confidence });
      }
      if (!text) {
        onError?.("Couldn't read any text in that photo.");
        recordEvent({ name: "capture_abandoned", mode: "photo", reason: "empty-ocr" });
        setState("idle");
        setHint("");
        return;
      }

      // Redact PII regions on the image before showing it in chat.
      setState("redacting");
      setHint("Redacting names…");
      const roster = await loadRosterForClassroom(classroomId);
      const { redactedUrl, redactedCount } = await redactPiiFromImage(
        blob,
        result.words ?? [],
        roster
      );

      onCapture({ text, redactedImageUrl: redactedUrl, redactedCount });
      recordEvent({
        name: "capture_completed",
        mode: "photo",
        proposalCount: 0,
        durationMs: performance.now() - t0,
      });
      setState("idle");
      setHint("");
    } catch (err) {
      const msg = (err as Error).message;
      setState("error");
      setHint(msg);
      onError?.(msg);
      recordEvent({ name: "capture_abandoned", mode: "photo", reason: "ocr-failed" });
    }
  }

  if (state === "open") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={videoRef} className="flex-1 object-cover" playsInline muted />
        <div className="flex items-center justify-between gap-3 bg-black/80 px-4 py-3">
          <Button variant="outline" size="sm" onClick={close} aria-label="Cancel camera">
            <X className="h-4 w-4" />
            Cancel
          </Button>
          <Button variant="default" size="lg" onClick={snap} aria-label="Capture photo">
            <Camera className="h-5 w-5" />
            Capture
          </Button>
          <span className="w-[88px]" />
        </div>
      </div>
    );
  }

  const isBusy = state === "loading-model" || state === "ocr" || state === "redacting";

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={open}
        disabled={disabled || isBusy}
        aria-label="Open camera"
      >
        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
      </Button>
      {hint ? <p className="text-[10px] text-ink/40">{hint}</p> : null}
    </div>
  );
}
