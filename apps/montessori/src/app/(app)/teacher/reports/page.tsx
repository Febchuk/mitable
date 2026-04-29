"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ReportsTable } from "@/components/reports/ReportsTable";
import { useCurrentClassroom, useStore } from "@/lib/store";
import type { Report } from "@/types";

export default function TeacherReportsPage() {
    const classroom = useCurrentClassroom();
    const { reports, updateReport } = useStore();
    if (!classroom) return null;

    const classroomReports = reports.filter((r) => r.classroomId === classroom.id);

    const actions = (r: Report) => (
        <>
            {r.status === "draft" && (
                <Button
                    size="sm"
                    variant="accent"
                    onClick={() =>
                        updateReport(r.id, {
                            status: "approved",
                            approvedAt: new Date().toISOString(),
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
                    onClick={() =>
                        updateReport(r.id, {
                            status: "sent",
                            sentAt: new Date().toISOString(),
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

            <ReportsTable reports={classroomReports} actions={actions} />
        </div>
    );
}
