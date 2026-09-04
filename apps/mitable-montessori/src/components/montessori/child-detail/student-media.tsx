"use client";

import * as React from "react";
import {
  Camera,
  Check,
  ImageIcon,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import {
  maxMediaBytes,
  mediaKindForMimeType,
  STUDENT_MEDIA_MIME_TYPES,
  type StudentMediaKind,
  type StudentMediaMimeType,
} from "@/lib/media/constants";
import "./child-detail.css";

const MAX_VIDEO_SECONDS = 90;

type CaptureScreen = "closed" | "chooser" | "camera" | "preview";

type CapturedMedia = {
  blob: Blob;
  url: string;
  kind: StudentMediaKind;
  mimeType: StudentMediaMimeType;
  source: "camera" | "device";
};

export type StudentMediaItem = {
  id: string;
  kind: StudentMediaKind;
  mimeType: StudentMediaMimeType;
  byteSize: number;
  caption: string;
  status: "uploading" | "shared" | "deleted";
  sharedAt: string | null;
  createdAt: string;
  uploadedBy: string | null;
  toddlerDailyLogId: string | null;
  url: string | null;
};

function durationLabel(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

async function responseError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error ?? fallback;
}

function preferredVideoMimeType() {
  const candidates = ["video/mp4", "video/webm;codecs=vp8,opus", "video/webm"];
  const supported = candidates.find(
    (candidate) =>
      typeof MediaRecorder.isTypeSupported !== "function" ||
      MediaRecorder.isTypeSupported(candidate)
  );
  if (!supported) return null;
  return supported.startsWith("video/mp4") ? "video/mp4" : "video/webm";
}

export function StudentMediaCapture({
  open,
  studentId,
  studentName,
  progressCommandId,
  toddlerDailyLogId,
  onClose,
  onShared,
}: {
  open: boolean;
  studentId: string;
  studentName: string;
  /** The single progress action this media documents. */
  progressCommandId?: string;
  /** The toddler daily log this media documents. */
  toddlerDailyLogId?: string;
  onClose: () => void;
  onShared: () => void;
}) {
  const [screen, setScreen] = React.useState<CaptureScreen>("closed");
  const [kind, setKind] = React.useState<StudentMediaKind>("photo");
  const [captured, setCaptured] = React.useState<CapturedMedia | null>(null);
  const [caption, setCaption] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const streamRef = React.useRef<MediaStream | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const timerRef = React.useRef<number | null>(null);
  const autoStopRef = React.useRef<number | null>(null);
  const recordingStartedRef = React.useRef(0);
  const capturedRef = React.useRef<CapturedMedia | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const stopTimer = React.useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (autoStopRef.current !== null) {
      window.clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  }, []);

  const stopCamera = React.useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    stopTimer();
    setRecording(false);
  }, [stopTimer]);

  const discardCaptured = React.useCallback(() => {
    if (capturedRef.current) URL.revokeObjectURL(capturedRef.current.url);
    capturedRef.current = null;
    setCaptured(null);
  }, []);

  const reset = React.useCallback(() => {
    stopCamera();
    discardCaptured();
    setCaption("");
    setError(null);
    setElapsed(0);
    setUploading(false);
  }, [discardCaptured, stopCamera]);

  React.useEffect(() => {
    if (!open) {
      reset();
      setScreen("closed");
      return;
    }
    setScreen("chooser");
  }, [open, reset]);

  React.useEffect(() => {
    if (screen !== "camera" || !streamRef.current || !videoRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => setError("Couldn't start the camera preview."));
  }, [screen]);

  React.useEffect(() => {
    return () => {
      stopCamera();
      if (capturedRef.current) URL.revokeObjectURL(capturedRef.current.url);
    };
  }, [stopCamera]);

  const close = () => {
    reset();
    setScreen("closed");
    onClose();
  };

  const openCamera = async (nextKind: StudentMediaKind) => {
    setError(null);
    discardCaptured();
    setCaption("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
        },
        audio:
          nextKind === "video"
            ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            : false,
      });
      streamRef.current = stream;
      setKind(nextKind);
      setElapsed(0);
      setScreen("camera");
    } catch (captureError) {
      const denied =
        captureError instanceof DOMException &&
        (captureError.name === "NotAllowedError" || captureError.name === "SecurityError");
      setError(
        denied
          ? "Mitable needs camera access to capture this moment. Allow camera access, then try again."
          : "We couldn't open the camera. Try again or check your device settings."
      );
    }
  };

  const saveCaptured = (
    blob: Blob,
    nextKind: StudentMediaKind,
    mimeType: StudentMediaMimeType,
    source: CapturedMedia["source"] = "camera"
  ) => {
    const nextCaptured = { blob, kind: nextKind, mimeType, source, url: URL.createObjectURL(blob) };
    capturedRef.current = nextCaptured;
    setCaptured(nextCaptured);
    setKind(nextKind);
    stopCamera();
    setScreen("preview");
  };

  const selectDeviceFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const nextKind = mediaKindForMimeType(file.type);
    if (!nextKind) {
      setError("Choose a JPEG or WebP photo, or an MP4 or WebM video.");
      return;
    }
    if (file.size > maxMediaBytes(nextKind)) {
      setError(
        `${nextKind === "photo" ? "Photo" : "Video"} exceeds the ${nextKind === "photo" ? "12 MB" : "100 MB"} limit.`
      );
      return;
    }
    saveCaptured(file, nextKind, file.type as StudentMediaMimeType, "device");
  };

  const takePhoto = async () => {
    const video = videoRef.current;
    if (!video || !streamRef.current) return;
    try {
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Camera frame unavailable");
      context.drawImage(video, 0, 0, width, height);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (image) => (image ? resolve(image) : reject(new Error("Couldn't capture the photo"))),
          "image/jpeg",
          0.88
        );
      });
      saveCaptured(blob, "photo", "image/jpeg");
    } catch {
      setError("We couldn't capture that photo. Please try again.");
    }
  };

  const finishRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (typeof MediaRecorder === "undefined") {
      setError(
        "Video recording isn't supported in this browser. Please use a recent mobile browser."
      );
      return;
    }
    const mimeType = preferredVideoMimeType();
    if (!stream || !mimeType) {
      setError(
        "Video recording isn't supported in this browser. Please use a recent mobile browser."
      );
      return;
    }
    try {
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 2_500_000,
        audioBitsPerSecond: 128_000,
      });
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size === 0) {
          setError("We couldn't save that video. Please try again.");
          return;
        }
        saveCaptured(blob, "video", mimeType);
      };
      recordingStartedRef.current = Date.now();
      recorder.start(1_000);
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        setElapsed(
          Math.min(
            MAX_VIDEO_SECONDS,
            Math.floor((Date.now() - recordingStartedRef.current) / 1_000)
          )
        );
      }, 250);
      autoStopRef.current = window.setTimeout(finishRecording, MAX_VIDEO_SECONDS * 1_000);
    } catch {
      setError("We couldn't begin recording. Please try again.");
    }
  };

  const retake = () => {
    const source = capturedRef.current?.source;
    discardCaptured();
    setCaption("");
    if (source === "device") {
      setScreen("chooser");
      return;
    }
    void openCamera(kind);
  };

  const share = async () => {
    if (!captured) return;
    setUploading(true);
    setError(null);
    try {
      const start = await fetch(`/api/v1/students/${studentId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: captured.kind,
          mimeType: captured.mimeType,
          byteSize: captured.blob.size,
          progressCommandId,
          toddlerDailyLogId,
        }),
      });
      if (!start.ok)
        throw new Error(await responseError(start, "Couldn't prepare the secure upload."));
      const upload = (await start.json()) as { mediaId: string; path: string; token: string };
      const { error: storageError } = await createClient()
        .storage.from("student-media")
        .uploadToSignedUrl(upload.path, upload.token, captured.blob, {
          contentType: captured.mimeType,
        });
      if (storageError) throw new Error("The upload didn't finish. Please try again.");

      const publish = await fetch(`/api/v1/students/${studentId}/media/${upload.mediaId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption }),
      });
      if (!publish.ok) throw new Error(await responseError(publish, "Couldn't share this moment."));

      onShared();
      close();
    } catch (shareError) {
      setError((shareError as Error).message);
      setUploading(false);
    }
  };

  if (screen === "closed") return null;

  if (screen === "chooser") {
    return (
      <CaptureSheet onClose={close}>
        <p className="label-cap" style={{ color: "var(--color-ink-muted)", margin: 0 }}>
          Share a classroom moment
        </p>
        <h2 style={sheetTitleStyle}>Share {studentName} at work</h2>
        <p style={sheetBodyStyle}>Take a new photo or video now, or choose one from this device.</p>
        <div style={{ display: "grid", gap: 10, marginTop: 20 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept={STUDENT_MEDIA_MIME_TYPES.join(",")}
            className="sr-only"
            aria-label="Choose photo or video from device"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void selectDeviceFile(file);
            }}
          />
          <CaptureChoice
            icon={<Upload size={21} strokeWidth={1.7} />}
            title="Choose from device"
            body="Select a photo or video already saved on this device."
            onClick={() => fileInputRef.current?.click()}
          />
          <CaptureChoice
            icon={<Camera size={21} strokeWidth={1.7} />}
            title="Take a photo"
            body="Capture one moment from the classroom."
            onClick={() => void openCamera("photo")}
          />
          <CaptureChoice
            icon={<Video size={21} strokeWidth={1.7} />}
            title="Record a video"
            body={`A short classroom moment, up to ${MAX_VIDEO_SECONDS} seconds.`}
            onClick={() => void openCamera("video")}
          />
        </div>
        {error ? <p style={errorStyle}>{error}</p> : null}
      </CaptureSheet>
    );
  }

  if (screen === "camera") {
    return (
      <div className="fixed inset-0 z-[90] flex flex-col bg-black text-white">
        {/* Live stream from getUserMedia; never a device-library picker. */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={videoRef} className="min-h-0 flex-1 object-cover" muted playsInline />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-4 py-4">
          <span className="rounded-full bg-black/35 px-3 py-1.5 text-xs font-medium">
            {kind === "photo"
              ? "Photo"
              : recording
                ? `Recording ${durationLabel(elapsed)}`
                : "Video"}
          </span>
          <button
            type="button"
            onClick={close}
            className="grid h-10 w-10 place-items-center rounded-full bg-black/35 text-white"
            aria-label="Cancel capture"
          >
            <X size={20} />
          </button>
        </div>
        <div className="bg-black px-5 pb-[max(22px,env(safe-area-inset-bottom))] pt-4">
          {error ? <p className="mb-3 text-center text-sm text-red-200">{error}</p> : null}
          <div className="flex items-center justify-center">
            {kind === "photo" ? (
              <button
                type="button"
                onClick={() => void takePhoto()}
                className="grid h-[72px] w-[72px] place-items-center rounded-full border-[5px] border-white bg-white/20"
                aria-label="Take photo"
              >
                <span className="h-[54px] w-[54px] rounded-full bg-white" />
              </button>
            ) : (
              <button
                type="button"
                onClick={recording ? finishRecording : startRecording}
                className="grid h-[72px] w-[72px] place-items-center rounded-full border-[5px] border-white bg-white/20"
                aria-label={recording ? "Stop recording" : "Start recording"}
              >
                <span
                  className={
                    recording
                      ? "h-7 w-7 rounded-md bg-red-500"
                      : "h-[54px] w-[54px] rounded-full bg-red-500"
                  }
                />
              </button>
            )}
          </div>
          <p className="mb-0 mt-3 text-center text-xs text-white/65">
            {kind === "photo"
              ? "Tap to capture"
              : recording
                ? "Tap to stop"
                : `Tap to start · maximum ${MAX_VIDEO_SECONDS} seconds`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <CaptureSheet onClose={close}>
      <p className="label-cap" style={{ color: "var(--color-ink-muted)", margin: 0 }}>
        Ready to share
      </p>
      <h2 style={sheetTitleStyle}>
        {kind === "photo" ? "Review your photo" : "Review your video"}
      </h2>
      <div
        style={{
          marginTop: 16,
          overflow: "hidden",
          borderRadius: 16,
          background: "var(--color-ink)",
          aspectRatio: kind === "photo" ? "4 / 3" : "16 / 9",
        }}
      >
        {captured?.kind === "photo" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={captured.url}
            alt={`Captured moment of ${studentName}`}
            className="h-full w-full object-cover"
          />
        ) : (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={captured?.url}
            className="h-full w-full"
            controls
            playsInline
            preload="metadata"
          />
        )}
      </div>
      <label className="mt-5 flex flex-col gap-1.5 text-sm font-medium text-ink">
        A short note <span className="font-normal text-ink-muted">(optional)</span>
        <textarea
          value={caption}
          onChange={(event) => setCaption(event.target.value.slice(0, 600))}
          placeholder="What is happening in this moment?"
          rows={3}
          disabled={uploading}
          className="resize-none rounded-xl border border-border bg-canvas px-3 py-2.5 text-sm font-normal text-ink outline-none focus:border-terracotta"
        />
      </label>
      <div
        style={{
          display: "flex",
          gap: 9,
          alignItems: "flex-start",
          marginTop: 14,
          padding: "11px 12px",
          borderRadius: 12,
          background: "var(--color-sage-soft)",
          color: "var(--color-sage-deep)",
          fontSize: 12.5,
          lineHeight: 1.45,
        }}
      >
        <ShieldCheck size={17} strokeWidth={1.7} style={{ flexShrink: 0, marginTop: 1 }} />
        This is private to Mitable until you share it. Sharing makes it visible to {studentName}
        &apos;s family.
      </div>
      {error ? <p style={errorStyle}>{error}</p> : null}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          type="button"
          className="ghost-btn tap justify-center"
          onClick={retake}
          disabled={uploading}
        >
          <RotateCcw size={16} /> {captured?.source === "device" ? "Choose another" : "Retake"}
        </button>
        <button
          type="button"
          className="primary-btn tap flex justify-center gap-2"
          onClick={() => void share()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check size={16} />}
          {uploading ? "Sharing…" : "Share with family"}
        </button>
      </div>
    </CaptureSheet>
  );
}

function CaptureSheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="cd-root cd-sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="cd-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Capture a family moment"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="cd-sheet-grip" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full border border-border bg-surface text-ink-secondary"
        >
          <X size={16} />
        </button>
        {children}
      </section>
    </div>
  );
}

function CaptureChoice({
  icon,
  title,
  body,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tap flex w-full items-center gap-3 rounded-2xl border border-border bg-canvas p-4 text-left text-ink"
    >
      <span style={iconCircleStyle}>{icon}</span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-ink-secondary">{body}</span>
      </span>
    </button>
  );
}

const iconCircleStyle: React.CSSProperties = {
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
  width: 46,
  height: 46,
  borderRadius: 14,
  background: "var(--color-terracotta-soft)",
  color: "var(--color-terracotta-deep)",
};

const sheetTitleStyle: React.CSSProperties = {
  margin: "7px 0 0",
  color: "var(--color-ink)",
  fontFamily: "var(--font-display)",
  fontSize: 25,
  lineHeight: 1.14,
};

const sheetBodyStyle: React.CSSProperties = {
  margin: "9px 0 0",
  color: "var(--color-ink-secondary)",
  fontSize: 13.5,
  lineHeight: 1.55,
};

const errorStyle: React.CSSProperties = {
  margin: "13px 0 0",
  color: "var(--color-terracotta-deep)",
  fontSize: 13,
  lineHeight: 1.45,
};

export function StudentMediaLibrary({
  studentId,
  studentName,
  refreshKey,
  mobile,
  onAddMedia,
  toddlerDailyLogId,
}: {
  studentId: string;
  studentName: string;
  refreshKey: number;
  mobile: boolean;
  /** The library is browse-only when capture belongs in another workflow. */
  onAddMedia?: () => void;
  /** When set, show only media attached to this toddler daily log. */
  toddlerDailyLogId?: string;
}) {
  const [items, setItems] = React.useState<StudentMediaItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [removingId, setRemovingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = toddlerDailyLogId
        ? `?toddlerDailyLogId=${encodeURIComponent(toddlerDailyLogId)}`
        : "";
      const response = await fetch(`/api/v1/students/${studentId}/media${query}`, {
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(await responseError(response, "Couldn't load family moments."));
      const payload = (await response.json()) as { items: StudentMediaItem[] };
      setItems(payload.items);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [studentId, toddlerDailyLogId]);

  React.useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const remove = async (item: StudentMediaItem) => {
    if (!window.confirm(`Remove this ${item.kind} from Mitable and ${studentName}'s family view?`))
      return;
    setRemovingId(item.id);
    try {
      const response = await fetch(`/api/v1/students/${studentId}/media/${item.id}`, {
        method: "DELETE",
      });
      if (!response.ok)
        throw new Error(await responseError(response, "Couldn't remove this media."));
      setItems((current) => current.filter((entry) => entry.id !== item.id));
    } catch (removeError) {
      setError((removeError as Error).message);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <section style={{ padding: mobile ? "8px 16px 0" : "10px 28px 0" }}>
      <div
        style={{
          border: "1px solid var(--color-border)",
          background: "var(--color-surface)",
          borderRadius: 16,
          padding: mobile ? 16 : 20,
          boxShadow: "0 1px 2px rgba(42,39,35,0.04)",
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="label-cap m-0 text-ink-muted">
              {toddlerDailyLogId ? "Daily log media" : "Family moments"}
            </p>
            <h2 className="mt-1 text-base font-semibold text-ink">Photos &amp; videos</h2>
            <p className="mt-1 text-xs leading-5 text-ink-secondary">
              {toddlerDailyLogId
                ? `Included with this daily log and shared with ${studentName}'s family.`
                : `Captured alongside classroom progress and shared with ${studentName}'s family.`}
            </p>
          </div>
          {onAddMedia ? (
            <button type="button" className="primary-btn tap shrink-0" onClick={onAddMedia}>
              <Camera size={15} /> Add
            </button>
          ) : null}
        </div>

        {loading ? (
          <p className="mt-5 text-sm text-ink-muted">Loading family moments…</p>
        ) : items.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-border bg-canvas px-4 py-5 text-center">
            <ImageIcon className="mx-auto h-5 w-5 text-ink-muted" strokeWidth={1.5} />
            <p className="mt-2 text-sm font-medium text-ink">No shared moments yet</p>
            <p className="mt-1 text-xs leading-5 text-ink-secondary">
              {toddlerDailyLogId
                ? "Photos and videos included with this daily log will appear here."
                : "Photos and videos captured with a progress update will appear here."}
            </p>
          </div>
        ) : (
          <div
            className="mt-5 grid gap-3"
            style={{ gridTemplateColumns: mobile ? "1fr" : "repeat(auto-fit, minmax(210px, 1fr))" }}
          >
            {items.map((item) => (
              <article
                key={item.id}
                className="overflow-hidden rounded-xl border border-border bg-canvas"
              >
                <div className="aspect-[4/3] bg-muted">
                  {item.url && item.kind === "photo" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.url}
                      alt={item.caption || `Moment shared for ${studentName}`}
                      className="h-full w-full object-cover"
                    />
                  ) : item.url ? (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video
                      src={item.url}
                      className="h-full w-full object-cover"
                      controls
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-xs text-ink-muted">
                      Preview unavailable
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-ink">
                        {item.status === "shared" ? "Shared with family" : "Upload incomplete"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-muted">
                        {formatDate(item.createdAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="grid h-7 w-7 place-items-center rounded-md text-ink-muted hover:bg-terracotta-soft hover:text-terracotta-deep"
                      onClick={() => void remove(item)}
                      disabled={removingId === item.id}
                      aria-label={`Remove ${item.kind}`}
                    >
                      {removingId === item.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 size={15} />
                      )}
                    </button>
                  </div>
                  {item.caption ? (
                    <p className="mt-2 text-xs leading-5 text-ink-secondary">{item.caption}</p>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
        {error ? <p style={errorStyle}>{error}</p> : null}
      </div>
    </section>
  );
}
