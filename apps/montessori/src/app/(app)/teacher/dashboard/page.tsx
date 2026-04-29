"use client";

import * as React from "react";
import Link from "next/link";
import { CheckSquare, FileText, Grid3x3, Loader2, MessageCircle } from "lucide-react";

import { useAuth } from "@/lib/auth/AuthContext";
import { useAttendance, useGrid } from "@/lib/query/montessoriQueries";
import { Card, CardContent } from "@/components/ui/card";
import {
    formatRelativeDate,
    lastObservationDate,
    MASTERY_TONE_COLORS,
    MASTERY_TONE_LABEL,
    overallMasteryTone,
} from "@/lib/analytics";

const quickLinks = [
    { href: "/teacher/grid", label: "Open grid", icon: Grid3x3 },
    { href: "/teacher/agent", label: "Open agent", icon: MessageCircle, accent: true },
    { href: "/teacher/attendance", label: "Take attendance", icon: CheckSquare },
    { href: "/teacher/reports", label: "Generate reports", icon: FileText },
];

function todayISO(): string {
    return new Date().toISOString().slice(0, 10);
}

function prettyDate(): string {
    return new Date().toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
    });
}

export default function TeacherDashboardPage() {
    const { me } = useAuth();
    const classroomId = me?.assignedClassroom?.id ?? null;
    const today = todayISO();
    const grid = useGrid(classroomId);
    const attendanceSnapshot = useAttendance(classroomId, today);

    if (!classroomId) {
        return (
            <div className="p-6 text-sm text-ink-secondary">
                You don&apos;t have a classroom assigned yet. Ask an admin to assign you to one.
            </div>
        );
    }
    if (grid.isLoading || !grid.data) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="h-5 w-5 text-ink-tertiary animate-spin" />
            </div>
        );
    }
    if (grid.error) {
        return (
            <div className="p-6 text-sm text-status-error">
                Couldn&apos;t load your dashboard: {String((grid.error as Error).message)}
            </div>
        );
    }

    const { classroom, students: classStudents, topics, observations } = grid.data;
    // Topics are already pre-filtered to active + level on the server, but
    // overallMasteryTone() still wants the active list scoped further if the
    // user adds curriculum filters in the future. Today we just pass through.
    const levelTopics = topics;

    const todayEntries = attendanceSnapshot.data?.entries ?? [];
    const presentCount =
        todayEntries.length > 0
            ? todayEntries.filter((a) => a.status === "present").length
            : classStudents.length;
    const totalCount = classStudents.length;

    return (
        <div className="p-4 md:p-6 pb-24 md:pb-6 space-y-6 max-w-5xl">
            <header className="space-y-1">
                <div className="text-xs text-ink-tertiary uppercase tracking-wider font-semibold">
                    {prettyDate()}
                </div>
                <h1 className="text-2xl font-semibold text-ink-primary">
                    Good morning, {classroom.name.split(" ")[0]}.
                </h1>
                <p className="text-sm text-ink-secondary">
                    {classroom.name} · {classStudents.length} students
                    {classroom.ageRange ? ` · ages ${classroom.ageRange}` : ""}
                </p>
            </header>

            <Card>
                <CardContent className="p-4 flex items-center justify-between">
                    <div>
                        <div className="text-xs text-ink-tertiary uppercase tracking-wider font-semibold">
                            Attendance today
                        </div>
                        <div className="text-xl text-ink-primary font-semibold mt-0.5">
                            {presentCount} of {totalCount} present
                        </div>
                    </div>
                    <Link
                        href="/teacher/attendance"
                        className="text-xs text-accent hover:underline"
                    >
                        Open the register →
                    </Link>
                </CardContent>
            </Card>

            <section>
                <div className="text-xs text-ink-tertiary uppercase tracking-wider font-semibold mb-2">
                    Your class
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {classStudents.map((s) => {
                        const tone = overallMasteryTone(s.id, levelTopics, observations);
                        const last = lastObservationDate(s.id, observations);
                        return (
                            <Link
                                key={s.id}
                                href={`/teacher/students/${s.id}`}
                                className="group border border-stroke-subtle rounded-xl bg-canvas-raised hover:bg-canvas-overlay transition-colors p-3"
                            >
                                <div className="flex items-start gap-2">
                                    <span className="h-9 w-9 rounded-full bg-canvas-muted border border-stroke-subtle flex items-center justify-center text-xs font-semibold text-ink-secondary">
                                        {s.name.slice(0, 2).toUpperCase()}
                                    </span>
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium text-ink-primary truncate">
                                            {s.name}
                                        </div>
                                        <div className="text-[11px] text-ink-tertiary">
                                            Age {s.age}
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-tertiary">
                                    <span
                                        className="h-2 w-2 rounded-full shrink-0"
                                        style={{ background: MASTERY_TONE_COLORS[tone] }}
                                    />
                                    <span className="truncate">{MASTERY_TONE_LABEL[tone]}</span>
                                </div>
                                <div className="text-[11px] text-ink-tertiary mt-0.5">
                                    Last note: {formatRelativeDate(last)}
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </section>

            <section>
                <div className="text-xs text-ink-tertiary uppercase tracking-wider font-semibold mb-2">
                    Quick actions
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {quickLinks.map((link) => {
                        const Icon = link.icon;
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className="flex items-center gap-2.5 h-14 px-3 rounded-xl border border-stroke-subtle bg-canvas-raised hover:bg-canvas-overlay transition-colors"
                            >
                                <span
                                    className={
                                        link.accent
                                            ? "h-8 w-8 rounded-lg bg-accent-bg border border-accent-border flex items-center justify-center"
                                            : "h-8 w-8 rounded-lg bg-canvas-muted flex items-center justify-center"
                                    }
                                >
                                    <Icon
                                        className={
                                            link.accent
                                                ? "h-4 w-4 text-accent"
                                                : "h-4 w-4 text-ink-secondary"
                                        }
                                    />
                                </span>
                                <span className="text-sm text-ink-primary font-medium">
                                    {link.label}
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
