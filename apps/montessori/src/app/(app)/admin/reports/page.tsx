"use client";

import * as React from "react";

import { useStore } from "@/lib/store";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ReportsTable } from "@/components/reports/ReportsTable";

export default function AdminReportsPage() {
    // Still on store data here; this page gets fully rewired to the
    // /reports + /classrooms endpoints in commit 1.2d (admin pages).
    const { reports, classrooms, students } = useStore();
    const [classroomFilter, setClassroomFilter] = React.useState("all");
    const [typeFilter, setTypeFilter] = React.useState("all");
    const [statusFilter, setStatusFilter] = React.useState("all");

    const filtered = reports.filter(
        (r) =>
            (classroomFilter === "all" || r.classroomId === classroomFilter) &&
            (typeFilter === "all" || r.type === typeFilter) &&
            (statusFilter === "all" || r.status === statusFilter)
    );

    return (
        <div className="p-6 space-y-4 max-w-6xl">
            <header>
                <h1 className="text-2xl font-semibold text-ink-primary">Reports</h1>
                <p className="text-sm text-ink-secondary">
                    All generated reports across the school.
                </p>
            </header>

            <div className="flex items-center gap-2 flex-wrap">
                <Select value={classroomFilter} onValueChange={setClassroomFilter}>
                    <SelectTrigger className="h-8 w-44 text-xs">
                        <SelectValue placeholder="All classrooms" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All classrooms</SelectItem>
                        {classrooms.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                                {c.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="h-8 w-44 text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        <SelectItem value="end-of-term">End of term</SelectItem>
                        <SelectItem value="activity-update">Activity update</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-8 w-44 text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="sent">Sent</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <ReportsTable reports={filtered} students={students} classrooms={classrooms} />
        </div>
    );
}
