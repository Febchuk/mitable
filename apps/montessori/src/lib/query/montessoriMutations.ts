"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest, apiRequestForm } from "@/lib/api/client";
import { montessoriKeys } from "@/lib/query/montessoriQueries";
import type { ProposedUpdatesEnvelope } from "@/types/proposed-updates";
import type { InputMethod, MasteryLevel, Report, ReportStatus } from "@/types";

/**
 * Mutation hooks. Each one invalidates the queries that could be stale
 * after the write so the UI reflects the truth on next read. We don't
 * do optimistic updates yet — the backend is fast enough on local data
 * that the round-trip is invisible, and the agent flow (Phase 2)
 * deliberately wants the user to see "saving…" before "saved" so the
 * difference between proposed and persisted stays unambiguous.
 */

// ─── setObservation ──────────────────────────────────────────────────

export interface SetObservationInput {
    studentId: string;
    topicId: string;
    classroomId: string; // for cache invalidation only
    level: MasteryLevel;
    note?: string | null;
    inputMethod?: InputMethod;
    authorType?: "teacher" | "agent";
}

export function useSetObservation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input: SetObservationInput) => {
            const { classroomId: _classroomId, ...body } = input;
            return apiRequest<{ observation: { id: string } }>("/montessori/observations", {
                method: "POST",
                body: JSON.stringify(body),
            });
        },
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: montessoriKeys.grid(vars.classroomId) });
            qc.invalidateQueries({ queryKey: montessoriKeys.studentObservations(vars.studentId) });
        },
    });
}

// ─── saveAttendance ──────────────────────────────────────────────────

export interface AttendanceUpsertEntry {
    studentId: string;
    status: "present" | "absent";
    note?: string | null;
}

export interface SaveAttendanceInput {
    classroomId: string;
    date: string; // YYYY-MM-DD
    entries: AttendanceUpsertEntry[];
}

export function useSaveAttendance() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input: SaveAttendanceInput) => {
            return apiRequest<{ entries: unknown[] }>("/montessori/attendance", {
                method: "PUT",
                body: JSON.stringify(input),
            });
        },
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({
                queryKey: montessoriKeys.attendance(vars.classroomId, vars.date),
            });
            // Per-student attendance histories also need a refresh.
            for (const e of vars.entries) {
                qc.invalidateQueries({ queryKey: montessoriKeys.studentAttendance(e.studentId) });
            }
        },
    });
}

// ─── interpretCapture (agent /interpret) ─────────────────────────────

export interface InterpretCaptureInput {
    /** Optional thread to append to. If absent the backend creates one. */
    threadId?: string | null;
    text?: string | null;
    photo?: { blob: Blob; mimeType: string } | null;
    audio?: { blob: Blob; mimeType: string } | null;
}

export interface InterpretCaptureResult {
    threadId: string;
    messageId: string;
    envelope: ProposedUpdatesEnvelope;
}

/**
 * Calls POST /api/montessori/agent/interpret. Multipart so the photo
 * and/or audio bytes ride alongside the text field. The server
 * deletes the raw bytes after Gemini interprets — see
 * agent.ts at the route.
 */
export function useInterpretCapture() {
    return useMutation({
        mutationFn: async (input: InterpretCaptureInput): Promise<InterpretCaptureResult> => {
            const form = new FormData();
            if (input.threadId) form.append("threadId", input.threadId);
            if (input.text != null) form.append("text", input.text);
            if (input.photo) {
                // Pick a sensible filename so the multipart part has
                // one even though the server only reads the buffer.
                const ext = input.photo.mimeType.includes("png") ? "png" : "jpg";
                form.append(
                    "photo",
                    new File([input.photo.blob], `photo.${ext}`, {
                        type: input.photo.mimeType,
                    })
                );
            }
            if (input.audio) {
                const ext = input.audio.mimeType.includes("mp4") ? "m4a" : "webm";
                form.append(
                    "audio",
                    new File([input.audio.blob], `audio.${ext}`, {
                        type: input.audio.mimeType,
                    })
                );
            }
            return apiRequestForm<InterpretCaptureResult>(
                "/montessori/agent/interpret",
                form
            );
        },
    });
}

// ─── updateReport ────────────────────────────────────────────────────

export interface UpdateReportInput {
    id: string;
    classroomId?: string; // for cache invalidation
    status?: ReportStatus;
    summary?: string | null;
    sections?: Report["sections"];
}

export function useUpdateReport() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (input: UpdateReportInput) => {
            const { id, classroomId: _classroomId, ...body } = input;
            return apiRequest<{ report: unknown }>(`/montessori/reports/${id}`, {
                method: "PATCH",
                body: JSON.stringify(body),
            });
        },
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: montessoriKeys.report(vars.id) });
            // Both the per-classroom and the all-classrooms caches need
            // a refresh — admins watch the latter, teachers the former.
            qc.invalidateQueries({ queryKey: montessoriKeys.reports(null) });
            if (vars.classroomId) {
                qc.invalidateQueries({ queryKey: montessoriKeys.reports(vars.classroomId) });
            }
        },
    });
}
