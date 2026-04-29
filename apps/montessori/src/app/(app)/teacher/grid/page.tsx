"use client";

import * as React from "react";

import { ClassroomGrid } from "@/components/grid/ClassroomGrid";
import { useCurrentClassroom } from "@/lib/store";
import { GridLegend } from "@/components/grid/GridLegend";

export default function TeacherGridPage() {
    const classroom = useCurrentClassroom();
    if (!classroom) return null;
    return (
        <div className="h-full flex flex-col">
            <div className="px-4 md:px-6 pt-4 pb-2 flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <div className="text-xs text-ink-tertiary uppercase tracking-wider font-semibold">
                        {classroom.name} · Ages {classroom.ageRange}
                    </div>
                    <h1 className="text-lg font-semibold text-ink-primary">
                        Classroom grid
                    </h1>
                </div>
                <GridLegend />
            </div>
            <div className="flex-1 min-h-0">
                <ClassroomGrid classroom={classroom} />
            </div>
        </div>
    );
}
