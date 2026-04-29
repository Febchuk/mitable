"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { ClassroomGrid, type SetObservationArgs } from "@/components/grid/ClassroomGrid";
import { GridLegend } from "@/components/grid/GridLegend";
import { useAuth } from "@/lib/auth/AuthContext";
import { useGrid } from "@/lib/query/montessoriQueries";
import { useSetObservation } from "@/lib/query/montessoriMutations";

export default function TeacherGridPage() {
    const { me } = useAuth();
    const classroomId = me?.assignedClassroom?.id ?? null;
    const grid = useGrid(classroomId);

    const setObservationMutation = useSetObservation();
    const setObservation = React.useCallback(
        (args: SetObservationArgs) => {
            if (!classroomId) return;
            setObservationMutation.mutate({ ...args, classroomId });
        },
        [classroomId, setObservationMutation]
    );

    if (!classroomId) {
        return (
            <div className="h-full flex flex-col items-center justify-center px-6 text-center">
                <p className="text-sm text-ink-secondary">
                    You don&apos;t have a classroom assigned yet. Ask an admin to assign you to one.
                </p>
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
            <div className="h-full flex items-center justify-center px-6 text-center">
                <p className="text-sm text-status-error">
                    Couldn&apos;t load the classroom grid: {String((grid.error as Error).message)}
                </p>
            </div>
        );
    }

    const { classroom, students, domains, topics, observations } = grid.data;

    return (
        <div className="h-full flex flex-col">
            <div className="px-4 md:px-6 pt-4 pb-2 flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <div className="text-xs text-ink-tertiary uppercase tracking-wider font-semibold">
                        {classroom.name}
                        {classroom.ageRange ? ` · Ages ${classroom.ageRange}` : ""}
                    </div>
                    <h1 className="text-lg font-semibold text-ink-primary">Classroom grid</h1>
                </div>
                <GridLegend />
            </div>
            <div className="flex-1 min-h-0">
                <ClassroomGrid
                    classroom={classroom}
                    students={students}
                    domains={domains}
                    topics={topics}
                    observations={observations}
                    onSetObservation={setObservation}
                />
            </div>
        </div>
    );
}
