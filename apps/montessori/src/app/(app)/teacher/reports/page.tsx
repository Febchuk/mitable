"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ReportsTable } from "@/components/reports/ReportsTable";
import { useAuth } from "@/lib/auth/AuthContext";
import { useGrid, useReports } from "@/lib/query/montessoriQueries";
import { useUpdateReport } from "@/lib/query/montessoriMutations";
import type { Report } from "@/types";

export default function TeacherReportsPage() {
    const { me } = useAuth();
    const classroomId = me?.assignedClassroom?.id ?? null;

    const reports = useReports(classroomId);
    const grid = useGrid(classroomId);
    const updateReport = useUpdateReport();

    if (!classroomId) {
        return (
            <div className="p-6 text-sm text-ink-secondary">
                You don&apos;t have a classroom assigned yet. Ask an admin to assign you to one.
            </div>
        );
    }
    if (reports.isLoading || grid.isLoading || !reports.data || !grid.data) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="h-5 w-5 text-ink-tertiary animate-spin" />
            </div>
        );
    }

    const classroom = grid.data.classroom;
    const students = grid.data.students;

    const actions = (r: Report) => (
        <>
            {r.status === "draft" && (
                <Button
                    size="sm"
                    variant="accent"
                    disabled={updateReport.isPending}
                    onClick={() =>
                        updateReport.mutate({
                            id: r.id,
                            classroomId: r.classroomId,
                            status: "approved",
                        })
                    }
                >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                </Button>
            )}
            {r.status === "approved" && (
                <Button
                    size="sm"
                    variant="secondary"
                    disabled={updateReport.isPending}
                    onClick={() =>
                        updateReport.mutate({
                            id: r.id,
                            classroomId: r.classroomId,
                            status: "sent",
                        })
                    }
                >
                    <Send className="h-3.5 w-3.5" /> Mark sent
                </Button>
            )}
        </>
    );

    return (
        <div className="p-4 md:p-6 pb-24 md:pb-6 space-y-4 max-w-5xl">
            <header className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <div className="text-xs text-ink-tertiary uppercase tracking-wider font-semibold">
                        {classroom.name}
                    </div>
                    <h1 className="text-2xl font-semibold text-ink-primary">Reports</h1>
                    <p className="text-sm text-ink-secondary">
                        End-of-term narratives and activity updates for families.
                    </p>
                </div>
                <Link href="/teacher/agent">
                    <Button variant="accent">
                        <Sparkles className="h-3.5 w-3.5" /> Draft with agent
                    </Button>
                </Link>
            </header>

            <ReportsTable
                reports={reports.data}
                students={students}
                classrooms={[classroom]}
                actions={actions}
            />
        </div>
    );
}
