"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    CheckSquare,
    FileText,
    Grid3x3,
    LayoutDashboard,
    MessageCircle,
    Sparkles,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthContext";

const ITEMS = [
    { href: "/teacher/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/teacher/grid", label: "Classroom Grid", icon: Grid3x3 },
    { href: "/teacher/agent", label: "Agent", icon: MessageCircle, accent: true },
    { href: "/teacher/attendance", label: "Attendance", icon: CheckSquare },
    { href: "/teacher/reports", label: "Reports", icon: FileText },
];

export function TeacherSidebar() {
    const pathname = usePathname() ?? "";
    const { me } = useAuth();
    const teacherName =
        me?.user
            ? [me.user.firstName, me.user.lastName].filter(Boolean).join(" ").trim() ||
              me.user.email.split("@")[0]
            : "Teacher";
    const level = me?.assignedClassroom?.level ?? "primary";
    const label =
        level === "elementary" ? "Elementary · ages 6–12" : "Primary · ages 3–6";

    return (
        <aside
            className="w-56 shrink-0 border-r border-stroke-subtle flex flex-col"
            style={{ background: "var(--bg-raised)" }}
        >
            <div className="h-14 flex items-center gap-2 px-4 border-b border-stroke-subtle">
                <div className="h-7 w-7 rounded-lg border border-accent-border bg-accent-bg flex items-center justify-center">
                    <Sparkles className="h-3.5 w-3.5 text-accent" />
                </div>
                <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink-primary leading-tight">Mitable</div>
                    <div className="text-[10px] text-ink-tertiary uppercase tracking-wider">Montessori</div>
                </div>
            </div>
            <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
                {ITEMS.map((it) => {
                    const Icon = it.icon;
                    const active = pathname.startsWith(it.href);
                    return (
                        <Link
                            key={it.href}
                            href={it.href}
                            className={cn(
                                "flex items-center gap-2.5 h-9 px-3 rounded-lg text-sm transition-colors",
                                active
                                    ? "bg-canvas-overlay text-ink-primary"
                                    : "text-ink-secondary hover:bg-canvas-overlay hover:text-ink-primary"
                            )}
                        >
                            <Icon
                                className={cn(
                                    "h-4 w-4 shrink-0",
                                    active
                                        ? it.accent
                                            ? "text-accent"
                                            : "text-accent"
                                        : "text-ink-tertiary"
                                )}
                            />
                            <span className="flex-1 truncate">{it.label}</span>
                        </Link>
                    );
                })}
            </nav>
            <div className="p-3 border-t border-stroke-subtle text-[11px] text-ink-tertiary">
                <div className="font-medium text-ink-secondary truncate">{teacherName}</div>
                <div>{label}</div>
            </div>
        </aside>
    );
}
