"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/lib/api/client";
import { montessoriKeys } from "@/lib/query/montessoriQueries";
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
