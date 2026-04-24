"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckSquare, FileText, Grid3x3, LayoutDashboard, MessageCircle } from "lucide-react";

import { cn } from "@/lib/utils";

const ITEMS = [
    { href: "/teacher/dashboard", label: "Home", icon: LayoutDashboard, primary: false },
    { href: "/teacher/grid", label: "Grid", icon: Grid3x3, primary: false },
    { href: "/teacher/agent", label: "Agent", icon: MessageCircle, primary: true },
    { href: "/teacher/attendance", label: "Register", icon: CheckSquare, primary: false },
    { href: "/teacher/reports", label: "Reports", icon: FileText, primary: false },
];

export function TeacherTabBar() {
    const pathname = usePathname() ?? "";

    return (
        <nav
            className="h-16 shrink-0 border-t border-stroke-subtle flex items-stretch px-2"
            style={{ background: "var(--bg-raised)" }}
        >
            {ITEMS.map((it) => {
                const Icon = it.icon;
                const active = pathname.startsWith(it.href);
                return (
                    <Link
                        key={it.href}
                        href={it.href}
                        className={cn(
                            "flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors",
                            active ? "text-accent" : "text-ink-tertiary"
                        )}
                    >
                        <span
                            className={cn(
                                "flex items-center justify-center rounded-full",
                                it.primary
                                    ? "h-11 w-11 bg-accent-bg border border-accent-border -mt-3 shadow-lg"
                                    : "h-8 w-8"
                            )}
                        >
                            <Icon
                                className={cn(
                                    it.primary ? "h-5 w-5" : "h-4.5 w-4.5",
                                    active || it.primary ? "text-accent" : ""
                                )}
                            />
                        </span>
                        <span className="text-[10px] font-medium">{it.label}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
