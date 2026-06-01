"use client";

import type { ParsedToolCall } from "@/lib/schemas/parsed-tool-call";
import type { TokenReference } from "@/lib/tokenize/types";

export interface DetokenizedAttendance {
  kind: "attendance";
  studentId: string;
  studentDisplay: string;
  classroomId: string;
  status: "present" | "absent";
  date: string;
  comment?: string;
}

export interface DetokenizedProgress {
  kind: "progress";
  studentId: string;
  studentDisplay: string;
  subtopicId: string;
  subtopicDisplay: string;
  classroomId: string;
  status: "introduced" | "practicing" | "mastered" | "na";
  comment?: string;
}

export interface DetokenizedNote {
  kind: "note";
  studentId: string;
  studentDisplay: string;
  text: string;
}

export interface DetokenizedClarification {
  kind: "clarification";
  question: string;
  candidates: Array<{ token: string; display: string }>;
}

export type DetokenizedToolCall =
  | DetokenizedAttendance
  | DetokenizedProgress
  | DetokenizedNote
  | DetokenizedClarification;

function refFor(token: string, refs: TokenReference[]) {
  return refs.find((r) => r.token === token);
}

/**
 * Replace every token literal (e.g. `[STUDENT_1]`) in a free-text field with
 * its real display name. The parse LLM is instructed to keep names as tokens,
 * so note/comment/question text comes back tokenized — this puts the real
 * names back before anything is stored or shown in the app.
 */
export function detokenizeText(text: string, refs: TokenReference[]): string {
  if (!text) return text;
  let out = text;
  for (const r of refs) {
    if (!r.token || !r.display) continue;
    out = out.split(r.token).join(r.display);
  }
  return out;
}

export function detokenizeToolCall(
  call: ParsedToolCall,
  refs: TokenReference[],
  fallbackClassroomId: string
): DetokenizedToolCall | null {
  switch (call.tool) {
    case "mark_attendance": {
      const s = refFor(call.args.student_token, refs);
      const c = refFor(call.args.classroom_token, refs);
      if (!s) return null;
      return {
        kind: "attendance",
        studentId: s.id,
        studentDisplay: s.display,
        classroomId: c?.id ?? fallbackClassroomId,
        status: call.args.status,
        date: call.args.date,
        comment: call.args.comment ? detokenizeText(call.args.comment, refs) : call.args.comment,
      };
    }
    case "record_progress": {
      const s = refFor(call.args.student_token, refs);
      const sub = refFor(call.args.subtopic_token, refs);
      const c = refFor(call.args.classroom_token, refs);
      if (!s || !sub) return null;
      return {
        kind: "progress",
        studentId: s.id,
        studentDisplay: s.display,
        subtopicId: sub.id,
        subtopicDisplay: sub.display,
        classroomId: c?.id ?? fallbackClassroomId,
        status: call.args.status,
        comment: call.args.comment ? detokenizeText(call.args.comment, refs) : call.args.comment,
      };
    }
    case "add_observation_note": {
      const s = refFor(call.args.student_token, refs);
      if (!s) return null;
      return {
        kind: "note",
        studentId: s.id,
        studentDisplay: s.display,
        text: detokenizeText(call.args.text, refs),
      };
    }
    case "request_clarification":
      return {
        kind: "clarification",
        question: detokenizeText(call.args.question, refs),
        candidates: call.args.candidates ?? [],
      };
  }
}

export function describeDetokenized(call: DetokenizedToolCall): string {
  switch (call.kind) {
    case "attendance":
      return `Mark ${call.studentDisplay} ${call.status} on ${call.date}${
        call.comment ? ` — ${call.comment}` : ""
      }`;
    case "progress":
      return `Record ${call.studentDisplay} on ${call.subtopicDisplay}: ${call.status}${
        call.comment ? ` — ${call.comment}` : ""
      }`;
    case "note":
      return `Note for ${call.studentDisplay}: ${call.text}`;
    case "clarification":
      return `Need to clarify: ${call.question}`;
  }
}
