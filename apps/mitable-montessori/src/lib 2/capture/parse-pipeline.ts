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
}

/**
 * Shared "raw text → pending proposals" path. Used by typed input, Whisper
 * transcription, and OCR. Tokenization happens client-side, so the parse
 * endpoint never sees real names regardless of capture mode.
 */
export async function parseAndStageProposals(opts: PipelineOptions): Promise<PipelineResult> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const tokenized = await tokenizeText(opts.rawText);
  const todayIso = opts.todayIso ?? new Date().toISOString().slice(0, 10);

  const res = await fetchFn("/api/v1/ai/parse-command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tokenizedText: tokenized.tokenizedText,
      references: tokenized.references.map((r) => ({
        token: r.token,
        ref: r.id,
        kind: r.kind,
      })),
      classroomId: opts.classroomId,
      todayIso,
    }),
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`parse-command failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { toolCalls: ParsedToolCall[] };

  const db = getDb();
  const now = new Date().toISOString();
  const proposals: PipelineProposal[] = [];
  for (const call of json.toolCalls ?? []) {
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
    });
    proposals.push({ proposalId, call: detok, display, rawTranscript: opts.rawText });
  }

  return {
    proposals,
    ambiguous: tokenized.ambiguous,
    tokenizedText: tokenized.tokenizedText,
  };
}
