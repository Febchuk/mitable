"use client";

import * as React from "react";
import Link from "next/link";
import { BookOpen, FileText, MessageCircle, School, Users } from "lucide-react";

import { useStore } from "@/lib/store";
import { topicCoverageForClassroom } from "@/lib/analytics";
import { Card, CardContent } from "@/components/ui/card";

export default function AdminDashboardPage() {
    const { school, classrooms, students, teachers, topics, observations } = useStore();

    return (
        <div className="p-6 space-y-6 max-w-6xl">
            <header className="space-y-1">
                <div className="text-xs text-ink-tertiary uppercase tracking-wider font-semibold">
                    {school.name}
                </div>
                <h1 className="text-2xl font-semibold text-ink-primary">School overview</h1>
                <p className="text-sm text-ink-secondary">
                    {classrooms.length} classrooms · {students.length} students · {teachers.length}{" "}
                    teachers
                </p>
            </header>

            <section className="grid md:grid-cols-2 gap-3">
                {classrooms.map((c) => {
                    const teacher = teachers.find((t) => t.id === c.teacherId);
                    const classTopicIds = new Set(
                        topics
                            .filter((t) => t.level === c.level && t.active)
                            .map((t) => t.id)
                    );
                    const coverage = topicCoverageForClassroom(classTopicIds, observations);
                    const coveragePct = Math.round(coverage * 100);
                    return (
                        <Card key={c.id}>
                            <CardContent className="p-4">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="text-xs uppercase tracking-wider text-ink-tertiary font-semibold">
                                            Classroom
                                        </div>
                                        <div className="text-base font-semibold text-ink-primary">
                                            {c.name}
                                        </div>
                                        <div className="text-sm text-ink-tertiary">
                                            {teacher?.name ?? "Unassigned"} · {c.studentIds.length}{" "}
                                            students · ages {c.ageRange}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs text-ink-tertiary">
                                            Topic coverage
                                        </div>
                                        <div className="text-xl font-semibold text-accent">
                                            {coveragePct}%
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-3 h-1.5 rounded-full bg-canvas-muted overflow-hidden">
                                    <div
                                        className="h-full bg-accent"
                                        style={{ width: `${coveragePct}%` }}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </section>

            <section>
                <div className="text-xs text-ink-tertiary uppercase tracking-wider font-semibold mb-2">
                    Quick actions
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    <QuickLink href="/admin/classrooms" label="Classrooms" icon={School} />
                    <QuickLink href="/admin/curriculum" label="Curriculum" icon={BookOpen} />
                    <QuickLink href="/admin/teachers" label="Teachers" icon={Users} />
                    <QuickLink href="/admin/reports" label="Reports" icon={FileText} />
                    <QuickLink href="/admin/agent" label="Agent" icon={MessageCircle} accent />
                </div>
            </section>
        </div>
    );
}

function QuickLink({
    href,
    label,
    icon: Icon,
    accent = false,
}: {
    href: string;
    label: string;
    icon: React.ElementType;
    accent?: boolean;
}) {
    return (
        <Link
            href={href}
            className="flex flex-col items-start justify-center gap-1 h-20 px-4 rounded-xl border border-stroke-subtle bg-canvas-raised hover:bg-canvas-overlay transition-colors"
        >
            <span
                className={
                    accent
                        ? "h-7 w-7 rounded-lg bg-accent-bg border border-accent-border flex items-center justify-center"
                        : "h-7 w-7 rounded-lg bg-canvas-muted flex items-center justify-center"
                }
            >
                <Icon className={accent ? "h-4 w-4 text-accent" : "h-4 w-4 text-ink-secondary"} />
            </span>
            <span className="text-sm font-medium text-ink-primary">{label}</span>
        </Link>
    );
}
