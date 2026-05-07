"use client";

import { getDb } from "@/lib/db/schema";
import type { ParsedToolCall } from "@/lib/schemas/parsed-tool-call";
import {
  describeDetokenized,
  detokenizeToolCall,
  type DetokenizedToolCall,
} from "@/lib/tokenize/detokenize";
import { tokenizeText } from "@/lib/tokenize/tokenize";
import type { CaptureMode } from "@/lib/capture/types";
import {
  buildOfflineClarification,
  resolveLocally,
} from "@/lib/capture/local-resolve";
import type { IntentClassifier } from "@/lib/capture/intent-classifier";
import { getIntentEngine } from "@/lib/capture/engines";

export interface PipelineProposal {
  proposalId: string;
  call: DetokenizedToolCall;
  display: string;
  rawTranscript: string;
}

export interface PipelineResult {
  proposals: PipelineProposal[];
  ambiguous: boolean;
  tokenizedText: string;
}

export interface PipelineOptions {
  threadId: string;
  classroomId: string;
  rawText: string;
  mode: CaptureMode;
  todayIso?: string;
  fetchImpl?: typeof fetch;
  /**
   * Override the on-device intent engine (for tests). When omitted and the
   * `NEXT_PUBLIC_ENABLE_LOCAL_INTENT` flag is unset, the local path is skipped
   * entirely and the pipeline goes straight to the server.
   */
  intentEngine?: IntentClassifier;
}

function localIntentEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_LOCAL_INTENT === "1";
}

function isOnline(): boolean {
  if (typeof navigator === "undefined") return true; // SSR / Node tests assume online
  return navigator.onLine;
}

async function postParseCommand(
  fetchFn: typeof fetch,
  body: {
    tokenizedText: string;
    references: Array<{ token: string; ref: string; kind: string }>;
    classroomId: string;
    todayIso: string;
  }
): Promise<ParsedToolCall[]> {
  const res = await fetchFn("/api/v1/ai/parse-command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`parse-command failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { toolCalls: ParsedToolCall[] };
  return json.toolCalls ?? [];
}

/**
 * Shared "raw text → pending proposals" path. Used by typed input, Whisper
 * transcription, and OCR. Tokenization happens client-side, so the parse
 * endpoint never sees real names regardless of capture mode.
 *
 * Resolution order:
 *   1. If local intent is enabled (or an `intentEngine` is injected), try
 *      `resolveLocally` first. If it's confident, build proposals on-device.
 *   2. Otherwise, or on low-confidence local result + online, fall through to
 *      `/api/v1/ai/parse-command` (Anthropic Haiku).
 *   3. If we can't reach the server (offline) and local was unconfident,
 *      synthesize a `request_clarification` proposal so the teacher gets some
 *      acknowledgement instead of a swallowed network error.
 */
export async function parseAndStageProposals(opts: PipelineOptions): Promise<PipelineResult> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const tokenized = await tokenizeText(opts.rawText);
  const todayIso = opts.todayIso ?? new Date().toISOString().slice(0, 10);

  let toolCalls: ParsedToolCall[] = [];
  let source: "local" | "server" = "server";
  let intentScore: number | null = null;

  const classifier =
    opts.intentEngine ?? (localIntentEnabled() ? getIntentEngine() : null);

  if (classifier) {
    const local = await resolveLocally(
      {
        tokenizedText: tokenized.tokenizedText,
        references: tokenized.references,
        classroomId: opts.classroomId,
        todayIso,
      },
      classifier
    );

    if (local.ok) {
      toolCalls = local.calls;
      source = "local";
      intentScore = local.intentScore;
    } else if (isOnline()) {
      // Local was unconfident but we're online — let Haiku take a shot.
      toolCalls = await postParseCommand(fetchFn, {
        tokenizedText: tokenized.tokenizedText,
        references: tokenized.references.map((r) => ({
          token: r.token,
          ref: r.id,
          kind: r.kind,
        })),
        classroomId: opts.classroomId,
        todayIso,
      });
      source = "server";
    } else {
      // Offline + unconfident: synthesize a clarification so the teacher gets
      // a card instead of a network error.
      toolCalls = [
        buildOfflineClarification(
          {
            tokenizedText: tokenized.tokenizedText,
            references: tokenized.references,
            classroomId: opts.classroomId,
            todayIso,
          },
          local.topLabel
        ),
      ];
      source = "local";
    }
  } else {
    toolCalls = await postParseCommand(fetchFn, {
      tokenizedText: tokenized.tokenizedText,
      references: tokenized.references.map((r) => ({
        token: r.token,
        ref: r.id,
        kind: r.kind,
      })),
      classroomId: opts.classroomId,
      todayIso,
    });
    source = "server";
  }

  const db = getDb();
  const now = new Date().toISOString();
  const proposals: PipelineProposal[] = [];
  for (const call of toolCalls) {
    const detok = detokenizeToolCall(call, tokenized.references, opts.classroomId);
    if (!detok) continue;
    const display = describeDetokenized(detok);
    const proposalId = crypto.randomUUID();
    await db.chatProposals.add({
      id: proposalId,
      threadId: opts.threadId,
      createdAt: now,
      status: "proposed",
      toolName: call.tool,
      tokenizedPayload: call.args as Record<string, unknown>,
      resolvedPayload: detok as unknown as Record<string, unknown>,
      display,
      source,
      intentScore,
    });
    proposals.push({ proposalId, call: detok, display, rawTranscript: opts.rawText });
  }

  return {
    proposals,
    ambiguous: tokenized.ambiguous,
    tokenizedText: tokenized.tokenizedText,
  };
}
