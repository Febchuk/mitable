"use client";

import * as React from "react";
import { Camera, Check, Mic, MessageSquareText, Save, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrentClassroom, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { AttendanceEntry } from "@/types";

function todayISO(): string {
    return new Date().toISOString().slice(0, 10);
}

export default function AttendancePage() {
    const classroom = useCurrentClassroom();
    const { students, attendance, setAttendance } = useStore();
    const today = todayISO();

    const classStudents = React.useMemo(
        () => (classroom ? students.filter((s) => s.classroomId === classroom.id) : []),
        [students, classroom]
    );

    // Local draft state keyed by studentId
    const initialDraft = React.useMemo<Record<string, AttendanceEntry>>(() => {
        const map: Record<string, AttendanceEntry> = {};
        for (const s of classStudents) {
            const existing = attendance.find((a) => a.studentId === s.id && a.date === today);
            map[s.id] = existing ?? {
                id: `att_draft_${s.id}`,
                studentId: s.id,
                date: today,
                status: "present",
            };
        }
        return map;
    }, [classStudents, attendance, today]);

    const [draft, setDraft] = React.useState<Record<string, AttendanceEntry>>(initialDraft);
    const [dirty, setDirty] = React.useState(false);
    const [voiceBanner, setVoiceBanner] = React.useState<string | null>(null);

    React.useEffect(() => setDraft(initialDraft), [initialDraft]);

    const update = (studentId: string, patch: Partial<AttendanceEntry>) => {
        setDraft((prev) => ({ ...prev, [studentId]: { ...prev[studentId]!, ...patch } }));
        setDirty(true);
    };

    const save = () => {
        setAttendance(Object.values(draft));
        setDirty(false);
    };

    const applyVoiceMock = () => {
        setVoiceBanner(
            "Transcript: \"Kofi and Temi are absent, everyone else is here.\" — tap Confirm to apply."
        );
    };
    const confirmVoice = () => {
        const names = ["Kofi", "Temi"];
        const next = { ...draft };
        for (const s of classStudents) {
            next[s.id] = {
                ...next[s.id]!,
                status: names.includes(s.name) ? "absent" : "present",
            };
        }
        setDraft(next);
        setDirty(true);
        setVoiceBanner(null);
    };

    if (!classroom) return null;
    const prettyToday = new Date().toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
    });

    return (
        <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-3xl space-y-4">
            <header className="space-y-1">
                <div className="text-xs text-ink-tertiary uppercase tracking-wider font-semibold">
                    {classroom.name} · Attendance register
                </div>
                <h1 className="text-2xl font-semibold text-ink-primary">{prettyToday}</h1>
            </header>

            <div className="flex gap-2 flex-wrap">
                <Button variant="secondary" size="sm" onClick={applyVoiceMock}>
                    <Mic className="h-3.5 w-3.5" /> Say it
                </Button>
                <Button variant="secondary" size="sm" onClick={applyVoiceMock}>
                    <MessageSquareText className="h-3.5 w-3.5" /> Type it
                </Button>
                <Button variant="secondary" size="sm" onClick={applyVoiceMock}>
                    <Camera className="h-3.5 w-3.5" /> Photo the register
                </Button>
            </div>

            {voiceBanner && (
                <div className="flex items-start justify-between gap-3 rounded-xl border border-accent-border bg-accent-bg p-3 text-sm text-ink-primary">
                    <div className="flex-1">
                        <div className="text-xs uppercase font-semibold text-accent tracking-wider mb-1">
                            Agent preview
                        </div>
                        <div>{voiceBanner}</div>
                    </div>
                    <div className="flex gap-2">
                        <Button size="sm" variant="accent" onClick={confirmVoice}>
                            <Check className="h-3.5 w-3.5" /> Confirm
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setVoiceBanner(null)}>
                            <X className="h-3.5 w-3.5" /> Cancel
                        </Button>
                    </div>
                </div>
            )}

            <div className="border border-stroke-subtle rounded-xl overflow-hidden bg-canvas-raised">
                {classStudents.map((s, i) => {
                    const entry = draft[s.id]!;
                    return (
                        <div
                            key={s.id}
                            className={cn(
                                "flex items-center gap-3 p-3",
                                i > 0 && "border-t border-stroke-subtle"
                            )}
                        >
                            <span className="h-9 w-9 rounded-full bg-canvas-overlay border border-stroke-subtle flex items-center justify-center text-xs font-semibold text-ink-secondary">
                                {s.name.slice(0, 2).toUpperCase()}
                            </span>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm text-ink-primary font-medium">{s.name}</div>
                                <Input
                                    value={entry.note ?? ""}
                                    onChange={(e) => update(s.id, { note: e.target.value })}
                                    placeholder="Optional note (late, early pickup…)"
                                    className="mt-1 h-7 text-xs"
                                />
                            </div>
                            <div className="flex rounded-md border border-stroke-subtle overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => update(s.id, { status: "present" })}
                                    className={cn(
                                        "px-3 h-8 text-xs font-medium transition-colors",
                                        entry.status === "present"
                                            ? "bg-[rgba(var(--status-success-rgb),0.2)] text-status-success"
                                            : "text-ink-tertiary hover:bg-canvas-overlay"
                                    )}
                                >
                                    Present
                                </button>
                                <button
                                    type="button"
                                    onClick={() => update(s.id, { status: "absent" })}
                                    className={cn(
                                        "px-3 h-8 text-xs font-medium border-l border-stroke-subtle transition-colors",
                                        entry.status === "absent"
                                            ? "bg-[rgba(var(--status-error-rgb),0.22)] text-status-error"
                                            : "text-ink-tertiary hover:bg-canvas-overlay"
                                    )}
                                >
                                    Absent
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="flex items-center justify-between">
                <div className="text-xs text-ink-tertiary">
                    {dirty ? "You have unsaved changes." : "Register saved."}
                </div>
                <Button variant="accent" onClick={save} disabled={!dirty}>
                    <Save className="h-3.5 w-3.5" />
                    Save register
                </Button>
            </div>
        </div>
    );
}
