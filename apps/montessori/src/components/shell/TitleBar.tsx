"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";

import { UserMenu } from "@/components/shell/UserMenu";
import { useAuth } from "@/lib/auth/AuthContext";

function titleFromPath(pathname: string): string {
    const clean = pathname.replace(/^\//, "").split("?")[0]!;
    const segs = clean.split("/").filter(Boolean);
    if (segs.length === 0) return "Dashboard";

    const last = segs[segs.length - 1]!;
    const map: Record<string, string> = {
        dashboard: "Dashboard",
        grid: "Classroom Grid",
        attendance: "Attendance",
        agent: "Agent",
        reports: "Reports",
        classrooms: "Classrooms",
        curriculum: "Curriculum",
        teachers: "Teachers",
        students: "Students",
    };
    return map[last] ?? last.charAt(0).toUpperCase() + last.slice(1);
}

export function TitleBar() {
    const pathname = usePathname() ?? "/";
    const { me } = useAuth();
    const schoolName = me?.organization?.name ?? "";

    return (
        <header
            className="flex items-center justify-between px-4 md:px-6 h-14 border-b border-stroke-subtle shrink-0"
            style={{ background: "var(--bg-base)" }}
        >
            <div className="flex items-center gap-3 min-w-0">
                <div className="h-7 w-7 rounded-lg border border-accent-border bg-accent-bg flex items-center justify-center">
                    <Sparkles className="h-3.5 w-3.5 text-accent" />
                </div>
                <div className="min-w-0">
                    <div className="text-xs text-ink-tertiary tracking-wide uppercase font-medium">
                        {schoolName}
                    </div>
                    <div className="text-sm font-semibold text-ink-primary truncate">
                        {titleFromPath(pathname)}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <UserMenu />
            </div>
        </header>
    );
}
