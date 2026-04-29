"use client";

import * as React from "react";
import Link from "next/link";
import { BookOpen, FileText, Loader2, MessageCircle, School, Users } from "lucide-react";

import { useAuth } from "@/lib/auth/AuthContext";
import { useClassrooms, useStudents, useTeachers } from "@/lib/query/montessoriQueries";
import { Card, CardContent } from "@/components/ui/card";

export default function AdminDashboardPage() {
    const { me } = useAuth();
    const classrooms = useClassrooms();
    const students = useStudents();
    const teachers = useTeachers();

    if (
        classrooms.isLoading ||
        students.isLoading ||
        teachers.isLoading ||
        !classrooms.data ||
        !students.data ||
        !teachers.data
    ) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="h-5 w-5 text-ink-tertiary animate-spin" />
            </div>
        );
    }

    const studentCountByClassroom = new Map<string, number>();
    for (const s of students.data) {
        studentCountByClassroom.set(
            s.classroomId,
            (studentCountByClassroom.get(s.classroomId) ?? 0) + 1
        );
    }

    return (
        <div className="p-6 space-y-6 max-w-6xl">
            <header className="space-y-1">
                <div className="text-xs text-ink-tertiary uppercase tracking-wider font-semibold">
                    {me?.organization?.name ?? "School"}
                </div>
                <h1 className="text-2xl font-semibold text-ink-primary">School overview</h1>
                <p className="text-sm text-ink-secondary">
                    {classrooms.data.length} classrooms · {students.data.length} students ·{" "}
                    {teachers.data.length} teachers
                </p>
            </header>

            <section className="grid md:grid-cols-2 gap-3">
                {classrooms.data.map((c) => {
                    const teacher = teachers.data.find((t) => t.id === c.teacherId);
                    const studentCount = studentCountByClassroom.get(c.id) ?? 0;
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
                                            {teacher?.name ?? "Unassigned"} · {studentCount}{" "}
                                            students
                                            {c.ageRange ? ` · ages ${c.ageRange}` : ""}
                                        </div>
                                    </div>
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
