"use client";

import { getDb } from "@/lib/db/schema";
import type { CommandRow, AttendancePayload, ProgressPayload, NotePayload } from "@/lib/db/types";
import type { DetokenizedToolCall } from "@/lib/tokenize/detokenize";
import { notifySyncWorker } from "@/lib/sync/worker";

export interface ApplyContext {
  schoolId: string;
  userId: string;
  classroomId: string;
  rawTranscript: string | null;
  proposalId: string;
  /** Capture mode the command came from. Defaults to "text" for backward compat. */
  source?: "text" | "voice" | "photo";
}

export interface ApplyResult {
  commandId: string;
  clientId: string;
}

function newClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cmd-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function applyApprovedToolCall(
  call: DetokenizedToolCall,
  ctx: ApplyContext
): Promise<ApplyResult | null> {
  if (call.kind === "clarification") return null;

  const db = getDb();
  const id = newClientId();
  const clientId = id;
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  let row: CommandRow;

  if (call.kind === "attendance") {
    const payload: AttendancePayload = {
      student_id: call.studentId,
      status: call.status,
      date: call.date ?? today,
      comment: call.comment,
    };
    row = {
      id,
      clientId,
      schoolId: ctx.schoolId,
      userId: ctx.userId,
      classroomId: ctx.classroomId,
      source: ctx.source ?? "text",
      rawTranscript: ctx.rawTranscript,
      commandType: "attendance",
      payload,
      status: "approved",
      createdAt: now,
      approvedAt: now,
      syncedAt: null,
    };
    await db.transaction("rw", [db.commands, db.attendanceProj, db.chatProposals], async () => {
      await db.commands.put(row);
      await db.attendanceProj.put({
        studentId: call.studentId,
        date: payload.date,
        status: payload.status,
        comment: payload.comment ?? null,
        sourceCommandId: id,
        updatedAt: now,
      });
      await db.chatProposals.update(ctx.proposalId, {
        status: "approved",
        commandId: id,
      });
    });
  } else if (call.kind === "progress") {
    const payload: ProgressPayload = {
      student_id: call.studentId,
      subtopic_id: call.subtopicId,
      status: call.status,
      comment: call.comment,
    };
    row = {
      id,
      clientId,
      schoolId: ctx.schoolId,
      userId: ctx.userId,
      classroomId: ctx.classroomId,
      source: ctx.source ?? "text",
      rawTranscript: ctx.rawTranscript,
      commandType: "progress",
      payload,
      status: "approved",
      createdAt: now,
      approvedAt: now,
      syncedAt: null,
    };
    await db.transaction("rw", [db.commands, db.progressProj, db.chatProposals], async () => {
      await db.commands.put(row);
      await db.progressProj.put({
        studentId: call.studentId,
        subtopicId: call.subtopicId,
        classroomId: ctx.classroomId,
        status: payload.status,
        comment: payload.comment ?? null,
        sourceCommandId: id,
        updatedAt: now,
      });
      await db.chatProposals.update(ctx.proposalId, {
        status: "approved",
        commandId: id,
      });
    });
  } else if (call.kind === "note") {
    const payload: NotePayload = {
      student_id: call.studentId,
      text: call.text,
    };
    row = {
      id,
      clientId,
      schoolId: ctx.schoolId,
      userId: ctx.userId,
      classroomId: ctx.classroomId,
      source: ctx.source ?? "text",
      rawTranscript: ctx.rawTranscript,
      commandType: "note",
      payload,
      status: "approved",
      createdAt: now,
      approvedAt: now,
      syncedAt: null,
    };
    await db.transaction("rw", [db.commands, db.chatProposals], async () => {
      await db.commands.put(row);
      await db.chatProposals.update(ctx.proposalId, {
        status: "approved",
        commandId: id,
      });
    });
  } else {
    return null;
  }

  notifySyncWorker();
  return { commandId: id, clientId };
}

export async function rejectProposal(proposalId: string) {
  const db = getDb();
  await db.chatProposals.update(proposalId, { status: "rejected" });
}
