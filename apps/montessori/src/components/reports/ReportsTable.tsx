"use client";

import * as React from "react";
import { FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Classroom, Report, ReportStatus, ReportType, Student } from "@/types";
import { ReportPreviewModal } from "@/components/reports/ReportPreviewModal";

interface ReportsTableProps {
    reports: Report[];
    students: Student[];
    classrooms: Classroom[];
    teachers?: Array<{ id: string; name: string; email: string; classroomIds: string[] }>;
    actions?: (report: Report) => React.ReactNode;
}

function statusVariant(status: ReportStatus): "default" | "accent" | "success" {
    if (status === "draft") return "default";
    if (status === "approved") return "accent";
    return "success";
}

function typeLabel(type: ReportType): string {
    return type === "end-of-term" ? "End of Term" : "Activity Update";
}

export function ReportsTable({
    reports,
    students,
    classrooms,
    teachers,
    actions,
}: ReportsTableProps) {
    const [previewOpen, setPreviewOpen] = React.useState(false);
    const [previewReport, setPreviewReport] = React.useState<Report | null>(null);

    return (
        <>
            <div className="rounded-xl border border-stroke-subtle bg-canvas-raised overflow-hidden">
                <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_auto] gap-2 px-4 py-2.5 text-[10px] uppercase tracking-wider text-ink-tertiary font-semibold border-b border-stroke-subtle bg-canvas-base/60">
                    <span>Student</span>
                    <span>Classroom</span>
                    <span>Type</span>
                    <span>Date</span>
                    <span>Status</span>
                    <span />
                </div>
                {reports.length === 0 && (
                    <div className="px-4 py-8 text-sm text-ink-tertiary text-center">
                        No reports yet.
                    </div>
                )}
                {reports.map((r) => {
                    const s = students.find((x) => x.id === r.studentId);
                    const c = classrooms.find((x) => x.id === r.classroomId);
                    return (
                        <div
                            key={r.id}
                            className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_auto] gap-2 px-4 py-2.5 items-center text-sm border-b border-stroke-subtle last:border-b-0"
                        >
                            <span className="text-ink-primary font-medium truncate">
                                {s?.name ?? "Unknown"}
                            </span>
                            <span className="text-ink-secondary truncate">{c?.name}</span>
                            <span className="text-ink-secondary">{typeLabel(r.type)}</span>
                            <span className="text-ink-secondary">
                                {new Date(r.createdAt).toLocaleDateString()}
                            </span>
                            <span>
                                <Badge variant={statusVariant(r.status)}>
                                    {r.status === "draft"
                                        ? "Draft"
                                        : r.status === "approved"
                                          ? "Approved"
                                          : "Sent"}
                                </Badge>
                            </span>
                            <span className="flex gap-2 justify-end">
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => {
                                        setPreviewReport(r);
                                        setPreviewOpen(true);
                                    }}
                                >
                                    <FileText className="h-3.5 w-3.5" /> View PDF
                                </Button>
                                {actions?.(r)}
                            </span>
                        </div>
                    );
                })}
            </div>
            <ReportPreviewModal
                report={previewReport}
                open={previewOpen}
                onOpenChange={setPreviewOpen}
                students={students}
                classrooms={classrooms}
                teachers={teachers}
            />
        </>
    );
}
