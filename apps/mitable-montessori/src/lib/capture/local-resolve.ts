"use client";

import type { ParsedToolCall } from "@/lib/schemas/parsed-tool-call";
import type { TokenReference } from "@/lib/tokenize/types";

import {
  attendanceVerbSpan,
  countWords,
  extractAttendanceStatus,
  extractComment,
  extractDate,
  extractMasteryStatus,
  firstStudentToken,
  firstSubtopicToken,
  hasStudentToken,
  hasSubtopicToken,
  masteryVerbSpan,
} from "@/lib/capture/slot-extract";
import type {
  ClassifyOutcome,
  IntentClassifier,
  IntentLabel,
} from "@/lib/capture/intent-classifier";

const CLASSROOM_TOKEN = "[CLASSROOM_0]";

const CONFIDENCE_THRESHOLD = 0.6;
const MARGIN_THRESHOLD = 0.15;
const MAX_WORDS = 60;

export interface LocalResolveInput {
  tokenizedText: string;
  references: TokenReference[];
  classroomId: string;
  todayIso: string;
}

export type LocalResolveResult =
  | {
      ok: true;
      calls: ParsedToolCall[];
      source: "local";
      intentScore: number;
      label: IntentLabel;
    }
  | {
      ok: false;
      reason: "low_confidence" | "missing_subtopic" | "too_long" | "no_student";
      topLabel: IntentLabel;
      topScore: number;
    };

/**
 * On-device intent + slot resolution. Returns a structured tool-call list when
 * the NLI classifier is confident enough AND the tokenized text contains the
 * required entity tokens; otherwise returns a typed reason so the caller can
 * either fall through to the server (when online) or synthesize a
 * `request_clarification` (when offline).
 *
 * The classifier is injected so tests can pass a `StubIntentClassifier`.
 */
export async function resolveLocally(
  input: LocalResolveInput,
  classifier: IntentClassifier
): Promise<LocalResolveResult> {
  const { tokenizedText, classroomId, todayIso } = input;

  if (countWords(tokenizedText) > MAX_WORDS) {
    // Don't even bother running NLI — the text is too long for confident
    // intent + slot extraction. We still need a top label for the caller's
    // fallback message; pick request_clarification as a safe default.
    return {
      ok: false,
      reason: "too_long",
      topLabel: "request_clarification",
      topScore: 0,
    };
  }

  const outcome = await classifier.classify(tokenizedText);
  if (outcome.score < CONFIDENCE_THRESHOLD || outcome.margin < MARGIN_THRESHOLD) {
    return {
      ok: false,
      reason: "low_confidence",
      topLabel: outcome.label,
      topScore: outcome.score,
    };
  }

  const needsStudent =
    outcome.label === "mark_attendance" ||
    outcome.label === "record_progress" ||
    outcome.label === "add_observation_note";

  if (needsStudent && !hasStudentToken(tokenizedText)) {
    return {
      ok: false,
      reason: "no_student",
      topLabel: outcome.label,
      topScore: outcome.score,
    };
  }

  if (outcome.label === "record_progress" && !hasSubtopicToken(tokenizedText)) {
    return {
      ok: false,
      reason: "missing_subtopic",
      topLabel: outcome.label,
      topScore: outcome.score,
    };
  }

  // Multi-intent: even when NLI picks one label, scan for an additional
  // attendance verb + progress verb + subtopic that suggests a second call.
  const calls = buildCalls(outcome, tokenizedText, todayIso, classroomId);

  if (calls.length === 0) {
    // Slot extraction failed even though NLI was confident — fall back.
    return {
      ok: false,
      reason: "low_confidence",
      topLabel: outcome.label,
      topScore: outcome.score,
    };
  }

  void input.references; // referenced for type compatibility; detokenizer uses these later.

  return {
    ok: true,
    calls,
    source: "local",
    intentScore: outcome.score,
    label: outcome.label,
  };
}

function buildCalls(
  outcome: ClassifyOutcome,
  text: string,
  todayIso: string,
  _classroomId: string
): ParsedToolCall[] {
  const studentTok = firstStudentToken(text);
  const subtopicTok = firstSubtopicToken(text);

  const calls: ParsedToolCall[] = [];

  // The label NLI picked drives the primary call.
  switch (outcome.label) {
    case "mark_attendance": {
      const status = extractAttendanceStatus(text) ?? "present";
      const date = extractDate(text, todayIso);
      const verb = attendanceVerbSpan(text);
      if (studentTok) {
        calls.push({
          tool: "mark_attendance",
          args: {
            student_token: studentTok,
            classroom_token: CLASSROOM_TOKEN,
            status,
            date,
            comment: extractComment(text, verb ? [verb] : []) || undefined,
          },
        });
      }
      // Multi-intent: also record progress when a subtopic + mastery verb
      // appear in the same utterance.
      if (subtopicTok && extractMasteryStatus(text)) {
        const masteryVerb = masteryVerbSpan(text);
        const masteryStatus = extractMasteryStatus(text) ?? "practicing";
        if (studentTok) {
          calls.push({
            tool: "record_progress",
            args: {
              student_token: studentTok,
              subtopic_token: subtopicTok,
              classroom_token: CLASSROOM_TOKEN,
              status: masteryStatus,
              comment: extractComment(text, masteryVerb ? [masteryVerb] : []) || undefined,
            },
          });
        }
      }
      return calls;
    }
    case "record_progress": {
      if (!studentTok || !subtopicTok) return calls;
      const masteryStatus = extractMasteryStatus(text) ?? "practicing";
      const verb = masteryVerbSpan(text);
      calls.push({
        tool: "record_progress",
        args: {
          student_token: studentTok,
          subtopic_token: subtopicTok,
          classroom_token: CLASSROOM_TOKEN,
          status: masteryStatus,
          comment: extractComment(text, verb ? [verb] : []) || undefined,
        },
      });
      // Multi-intent: also mark attendance when an attendance verb shows up.
      if (extractAttendanceStatus(text)) {
        const attVerb = attendanceVerbSpan(text);
        const attStatus = extractAttendanceStatus(text) ?? "present";
        calls.push({
          tool: "mark_attendance",
          args: {
            student_token: studentTok,
            classroom_token: CLASSROOM_TOKEN,
            status: attStatus,
            date: extractDate(text, todayIso),
            comment: extractComment(text, attVerb ? [attVerb] : []) || undefined,
          },
        });
      }
      return calls;
    }
    case "add_observation_note": {
      if (!studentTok) return calls;
      const note = extractComment(text);
      const text2000 = note.slice(0, 2000) || "(no detail)";
      calls.push({
        tool: "add_observation_note",
        args: {
          student_token: studentTok,
          text: text2000,
        },
      });
      return calls;
    }
    case "request_clarification": {
      calls.push({
        tool: "request_clarification",
        args: {
          question: "I'm not sure what to record — can you say it again?",
          candidates: [],
        },
      });
      return calls;
    }
  }
}

/**
 * Build a request_clarification ParsedToolCall the caller can use when offline
 * and the local resolver wasn't confident. Surfaces the top NLI label as part
 * of the prompt so the teacher knows what we *thought* we heard, and includes
 * up to two student candidates from the tokenizer's references.
 */
export function buildOfflineClarification(
  input: LocalResolveInput,
  topLabel: IntentLabel
): ParsedToolCall {
  const studentRefs = input.references
    .filter((r) => r.kind === "student")
    .slice(0, 2)
    .map((r) => ({ token: r.token, display: r.display }));

  const questions: Record<IntentLabel, string> = {
    mark_attendance: "I think you wanted to mark attendance — who, and present or absent?",
    record_progress: "I think you wanted to record progress — for whom, on which material?",
    add_observation_note: "I think you wanted to add a note — for which student?",
    request_clarification: "I'm not sure what to record — can you say it again?",
  };

  return {
    tool: "request_clarification",
    args: {
      question: questions[topLabel],
      candidates: studentRefs,
    },
  };
}
