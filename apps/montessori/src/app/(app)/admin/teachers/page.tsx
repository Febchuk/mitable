"use client";

import * as React from "react";
import { Loader2, Mail } from "lucide-react";

import { useClassrooms, useTeachers } from "@/lib/query/montessoriQueries";

/**
 * Read-only teacher directory. Inviting / editing teachers ships in a
 * follow-up; user provisioning will lean on the existing Supabase Auth
 * flows rather than a new domain-specific endpoint.
 */
export default function TeachersPage() {
    const teachersQuery = useTeachers();
    const classroomsQuery = useClassrooms();
    const teachers = teachersQuery.data ?? [];
    const classrooms = classroomsQuery.data ?? [];

    const classroomsByTeacherId = React.useMemo(() => {
        const m = new Map<string, typeof classrooms>();
        for (const c of classrooms) {
            if (!c.teacherId) continue;
            const list = m.get(c.teacherId) ?? [];
            list.push(c);
            m.set(c.teacherId, list);
        }
        return m;
    }, [classrooms]);

    return (
        <div className="p-6 space-y-4 max-w-4xl">
            <header>
                <h1 className="text-2xl font-semibold text-ink-primary">Teachers</h1>
                <p className="text-sm text-ink-secondary">
                    The people running your classrooms.
                </p>
            </header>

            <div className="rounded-xl border border-stroke-subtle bg-canvas-raised overflow-hidden">
                <div className="grid grid-cols-[2fr_2fr_2fr] gap-2 px-4 py-2.5 text-[10px] uppercase tracking-wider text-ink-tertiary font-semibold border-b border-stroke-subtle bg-canvas-base/60">
                    <span>Name</span>
                    <span>Email</span>
                    <span>Classrooms</span>
                </div>
                {teachersQuery.isLoading && (
                    <div className="px-4 py-6 flex items-center justify-center">
                        <Loader2 className="h-4 w-4 text-ink-tertiary animate-spin" />
                    </div>
                )}
                {teachers.map((t) => {
                    const myClassrooms = classroomsByTeacherId.get(t.id) ?? [];
                    return (
                        <div
                            key={t.id}
                            className="grid grid-cols-[2fr_2fr_2fr] gap-2 px-4 py-3 items-center text-sm border-b border-stroke-subtle last:border-b-0"
                        >
                            <span className="text-ink-primary font-medium">{t.name}</span>
                            <span className="text-ink-secondary flex items-center gap-1.5">
                                <Mail className="h-3.5 w-3.5 text-ink-tertiary" />
                                {t.email}
                            </span>
                            <span className="text-ink-secondary">
                                {myClassrooms.map((c) => c.name).join(", ") || "—"}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
