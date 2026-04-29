"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { useClassrooms, useStudents, useTeachers } from "@/lib/query/montessoriQueries";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Read-only classroom directory. Add / edit / re-assign teacher
 * actions ship in a follow-up alongside the matching POST/PATCH
 * endpoints.
 */
export default function ClassroomsPage() {
    const classroomsQuery = useClassrooms();
    const teachersQuery = useTeachers();
    const studentsQuery = useStudents();

    const classrooms = classroomsQuery.data ?? [];
    const teachers = teachersQuery.data ?? [];
    const students = studentsQuery.data ?? [];

    const studentCountByClassroom = React.useMemo(() => {
        const counts = new Map<string, number>();
        for (const s of students) counts.set(s.classroomId, (counts.get(s.classroomId) ?? 0) + 1);
        return counts;
    }, [students]);

    if (classroomsQuery.isLoading || teachersQuery.isLoading) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="h-5 w-5 text-ink-tertiary animate-spin" />
            </div>
        );
    }

    return (
        <div className="p-6 space-y-4 max-w-5xl">
            <header>
                <h1 className="text-2xl font-semibold text-ink-primary">Classrooms</h1>
                <p className="text-sm text-ink-secondary">
                    The rooms in your school and the teachers running them.
                </p>
            </header>

            <div className="grid md:grid-cols-2 gap-3">
                {classrooms.map((c) => {
                    const teacher = teachers.find((t) => t.id === c.teacherId);
                    const studentCount = studentCountByClassroom.get(c.id) ?? 0;
                    return (
                        <Card key={c.id}>
                            <CardContent className="p-4 space-y-2">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="text-xs text-ink-tertiary uppercase tracking-wider font-semibold">
                                            Classroom
                                        </div>
                                        <div className="text-base font-semibold text-ink-primary">
                                            {c.name}
                                        </div>
                                    </div>
                                    <Badge variant="accent">
                                        {c.level === "primary"
                                            ? "Primary"
                                            : c.level === "elementary"
                                              ? "Elementary"
                                              : "Both"}
                                    </Badge>
                                </div>
                                <div className="text-sm text-ink-secondary">
                                    Teacher: {teacher?.name ?? "Unassigned"}
                                </div>
                                <div className="text-sm text-ink-secondary">
                                    {studentCount} students
                                    {c.ageRange ? ` · ages ${c.ageRange}` : ""}
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
