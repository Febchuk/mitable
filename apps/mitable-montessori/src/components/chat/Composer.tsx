"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { parseAndStageProposals } from "@/lib/capture/parse-pipeline";
import { captureSupported } from "@/lib/capture/engines";
import { recordEvent } from "@/lib/telemetry/events";
import type { CaptureMode } from "@/lib/capture/types";
import type { DetokenizedToolCall } from "@/lib/tokenize/detokenize";
import { CameraButton } from "@/components/chat/CameraButton";
import { DictationButton } from "@/components/chat/DictationButton";

export interface ComposerProps {
  threadId: string;
  classroomId: string;
}

export interface ComposerEmit {
  message: string;
  mode: CaptureMode;
  proposals: Array<{
    proposalId: string;
    call: DetokenizedToolCall;
    display: string;
    rawTranscript: string;
  }>;
}

export function Composer(props: ComposerProps & { onProposals: (e: ComposerEmit) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<string | null>(null);

  async function runPipeline(rawText: string, mode: CaptureMode) {
    setBusy(true);
    setError(null);
    setDebug(null);
    const t0 = performance.now();
    if (mode === "text") recordEvent({ name: "capture_started", mode: "text" });
    try {
      const result = await parseAndStageProposals({
        threadId: props.threadId,
        classroomId: props.classroomId,
        rawText,
        mode,
      });
      setDebug(`tokenized: ${result.tokenizedText}`);
      props.onProposals({ message: rawText, mode, proposals: result.proposals });
      recordEvent({
        name: "capture_completed",
        mode,
        proposalCount: result.proposals.length,
        durationMs: performance.now() - t0,
      });
      setText("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      recordEvent({ name: "command_parse_failed", category: classifyParseError(msg) });
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = text.trim();
    if (!raw) return;
    await runPipeline(raw, "text");
  }

  const support = captureSupported();

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 border-t border-ink/10 p-3">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="Type a quick observation… e.g. 'Mark Lina present and pink tower practicing'"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
          }
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-ink/40">
          {debug ?? "Tokenized client-side before any LLM call. ⌘/Ctrl+Enter to send."}
        </p>
        <div className="flex items-center gap-2">
          {support.voice ? (
            <DictationButton
              disabled={busy}
              onTranscript={(t) => void runPipeline(t, "voice")}
              onError={(m) => setError(m)}
            />
          ) : null}
          {support.photo ? (
            <CameraButton
              disabled={busy}
              onText={(t) => void runPipeline(t, "photo")}
              onError={(m) => setError(m)}
            />
          ) : null}
          <Button type="submit" size="sm" disabled={busy || !text.trim()}>
            <Send className="h-4 w-4" />
            {busy ? "Parsing…" : "Send"}
          </Button>
        </div>
      </div>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </form>
  );
}

function classifyParseError(message: string): string {
  // Local resolution short-circuits the network call entirely, so a network
  // error only reaches here when we fell through to `/api/v1/ai/parse-command`
  // — i.e. the on-device classifier was unconfident AND the device was online
  // when we tried, AND the request itself failed. (When offline + unconfident,
  // parse-pipeline synthesizes a request_clarification and never throws.)
  if (/network|fetch|offline/i.test(message)) return "network";
  if (/parse-command failed: 4/i.test(message)) return "client-error";
  if (/parse-command failed: 5/i.test(message)) return "server-error";
  if (/timeout/i.test(message)) return "timeout";
  return "unknown";
}
