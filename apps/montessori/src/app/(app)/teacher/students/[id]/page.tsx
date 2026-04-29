"use client";

import * as React from "react";
import { notFound, useParams } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import Link from "next/link";

import { useStore } from "@/lib/store";
import {
    useGrid,
    useStudent,
    useStudentAttendance,
    useStudentObservations,
} from "@/lib/query/montessoriQueries";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClassroomGrid } from "@/components/grid/ClassroomGrid";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MASTERY_VISUALS } from "@/components/grid/cell-visuals";

function dateRange(): string[] {
    const out: string[] = [];
    for (let i = 20; i >= 0; i--) {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - i);
        out.push(d.toISOString().slice(0, 10));
    }
    return out;
}

export default function StudentProfilePage() {
    const params = useParams<{ id: string }>();
    const studentId = params.id;

    const student = useStudent(studentId);
    const observations = useStudentObservations(studentId);
    const attendance = useStudentAttendance(studentId);
    // The grid component still wants the full classroom snapshot — we look
    // it up only once we know the student's classroomId.
    const grid = useGrid(student.data?.classroomId ?? null);
    const { setObservation } = useStore();
    const [showOriginal, setShowOriginal] = React.useState(false);

    if (student.isLoading) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="h-5 w-5 text-ink-tertiary animate-spin" />
            </div>
        );
    }
    if (student.error && (student.error as { status?: number }).status === 404) notFound();
    if (!student.data) notFound();

    if (grid.isLoading || !grid.data) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="h-5 w-5 text-ink-tertiary animate-spin" />
            </div>
        );
    }

    const studentObs = observations.data ?? [];
    const studentAttendance = attendance.data ?? [];
    const { classroom, students, domains, topics, observations: gridObs } = grid.data;

    const present = studentAttendance.filter((a) => a.status === "present").length;
    const absent = studentAttendance.filter((a) => a.status === "absent").length;
    const total = studentAttendance.length;
    const percent = total === 0 ? 0 : Math.round((present / total) * 100);

    const byDate = new Map(studentAttendance.map((a) => [a.date, a]));
    const calendar = dateRange();

    return (
        <div className="p-4 md:p-6 pb-24 md:pb-6 space-y-4 max-w-4xl">
            <Link
                href="/teacher/grid"
                className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink-primary"
            >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to grid
            </Link>

            <header className="flex items-start gap-4">
                <span className="h-14 w-14 rounded-full bg-canvas-overlay border border-stroke-subtle flex items-center justify-center text-lg font-semibold text-ink-secondary">
                    {student.data.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                    <h1 className="text-2xl font-semibold text-ink-primary">{student.data.name}</h1>
                    <div className="text-sm text-ink-tertiary">
                        Age {student.data.age} · {classroom.name}
                    </div>
                </div>
            </header>

            <Tabs defaultValue="progress">
                <TabsList>
                    <TabsTrigger value="progress">Progress</TabsTrigger>
                    <TabsTrigger value="attendance">Attendance</TabsTrigger>
                </TabsList>

                <TabsContent value="progress">
                    <div className="border border-stroke-subtle rounded-xl overflow-hidden bg-canvas-raised">
                        <div className="max-h-[340px]">
                            <ClassroomGrid
                                classroom={classroom}
                                students={students}
                                domains={domains}
                                topics={topics}
                                observations={gridObs}
                                onSetObservation={setObservation}
                                filterStudentIds={[student.data.id]}
                                compact
                                hideToolbar
                            />
                        </div>
                    </div>

                    <div className="mt-6 space-y-2">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-ink-primary">
                                Observation timeline
                            </h2>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowOriginal((v) => !v)}
                            >
                                {showOriginal ? (
                                    <>
                                        <EyeOff className="h-3.5 w-3.5" /> Hide original input
                                    </>
                                ) : (
                                    <>
                                        <Eye className="h-3.5 w-3.5" /> Show original input
                                    </>
                                )}
                            </Button>
                        </div>
                        {studentObs.length === 0 ? (
                            <div className="text-sm text-ink-tertiary border border-stroke-subtle rounded-xl p-4 bg-canvas-raised">
                                No observations logged yet.
                            </div>
                        ) : (
                            <ol className="border border-stroke-subtle rounded-xl overflow-hidden bg-canvas-raised divide-y divide-stroke-subtle">
                                {studentObs.slice(0, 30).map((obs) => {
                                    const topic = topics.find((t) => t.id === obs.topicId);
                                    const domain = domains.find((d) => d.id === topic?.domainId);
                                    const visuals = MASTERY_VISUALS[obs.level];
                                    return (
                                        <li key={obs.id} className="p-3 flex gap-3">
                                            <span
                                                className="h-8 w-8 rounded-md border flex items-center justify-center text-sm shrink-0"
                                                style={{
                                                    background: visuals.bg,
                                                    color: visuals.color,
                                                    borderColor: visuals.borderColor,
                                                }}
                                            >
                                                {visuals.symbol || "—"}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap text-[11px] text-ink-tertiary uppercase tracking-wider">
                                                    <span>
                                                        {new Date(obs.createdAt).toLocaleDateString()}
                                                    </span>
                                                    {domain && (
                                                        <Badge
                                                            variant="outline"
                                                            className="normal-case tracking-normal"
                                                        >
                                                            {domain.name}
                                                        </Badge>
                                                    )}
                                                    <span>· {topic?.name}</span>
                                                    <span>· {visuals.label}</span>
                                                    {obs.authorType === "agent" && (
                                                        <Badge
                                                            variant="accent"
                                                            className="normal-case tracking-normal"
                                                        >
                                                            via agent
                                                        </Badge>
                                                    )}
                                                </div>
                                                {obs.summary && (
                                                    <div className="text-sm text-ink-primary mt-1">
                                                        {obs.summary}
                                                    </div>
                                                )}
                                                {showOriginal &&
                                                    obs.note &&
                                                    obs.note !== obs.summary && (
                                                        <div className="text-xs text-ink-tertiary italic mt-1">
                                                            original: {obs.note}
                                                        </div>
                                                    )}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ol>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="attendance">
                    <div className="flex flex-wrap gap-3 mb-4">
                        <Stat label="Present" value={present} />
                        <Stat label="Absent" value={absent} />
                        <Stat label="Attendance" value={`${percent}%`} />
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                        {calendar.map((d) => {
                            const entry = byDate.get(d);
                            const weekday = new Date(d + "T12:00Z").getUTCDay();
                            const weekend = weekday === 0 || weekday === 6;
                            const color = !entry
                                ? "rgba(var(--ui-rgb),0.05)"
                                : entry.status === "present"
                                  ? "rgba(var(--status-success-rgb),0.25)"
                                  : entry.status === "absent"
                                    ? "rgba(var(--status-error-rgb),0.3)"
                                    : "rgba(var(--ui-rgb),0.05)";
                            return (
                                <div
                                    key={d}
                                    className={cn(
                                        "h-10 rounded-md border border-stroke-subtle flex flex-col items-center justify-center text-[10px]",
                                        weekend && "opacity-40"
                                    )}
                                    style={{ background: color }}
                                >
                                    <span className="text-ink-primary">
                                        {new Date(d).getUTCDate()}
                                    </span>
                                    {entry && (
                                        <span
                                            className="h-1 w-1 rounded-full"
                                            style={{
                                                background:
                                                    entry.status === "present"
                                                        ? "var(--status-success)"
                                                        : "var(--status-error)",
                                            }}
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-xl border border-stroke-subtle bg-canvas-raised px-4 py-3 min-w-[100px]">
            <div className="text-[10px] uppercase tracking-wider text-ink-tertiary font-semibold">
                {label}
            </div>
            <div className="text-lg text-ink-primary font-semibold">{value}</div>
        </div>
    );
}
