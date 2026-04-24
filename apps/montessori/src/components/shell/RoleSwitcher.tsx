"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, GraduationCap, Shield, Users } from "lucide-react";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStore } from "@/lib/store";
import type { Role } from "@/types";

const ROLES: { id: Role; label: string; subtitle: string; icon: React.ElementType; landing: string }[] = [
    {
        id: "teacher-primary",
        label: "Teacher",
        subtitle: "Primary (ages 3–6)",
        icon: GraduationCap,
        landing: "/teacher/grid",
    },
    {
        id: "teacher-elementary",
        label: "Teacher",
        subtitle: "Elementary (ages 6–12)",
        icon: Users,
        landing: "/teacher/grid",
    },
    {
        id: "admin",
        label: "Admin",
        subtitle: "School-wide view",
        icon: Shield,
        landing: "/admin/dashboard",
    },
];

export function RoleSwitcher() {
    const { role, setRole } = useStore();
    const router = useRouter();

    const current = ROLES.find((r) => r.id === role) ?? ROLES[0]!;
    const Icon = current.icon;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="flex items-center gap-2 rounded-full border border-stroke-subtle bg-canvas-raised hover:bg-canvas-overlay transition-colors pl-2 pr-3 h-8 text-xs"
                >
                    <span className="h-5 w-5 rounded-full bg-accent-bg border border-accent-border flex items-center justify-center">
                        <Icon className="h-3 w-3 text-accent" />
                    </span>
                    <span className="text-ink-primary font-medium">{current.label}</span>
                    <span className="text-ink-tertiary hidden sm:inline">· {current.subtitle}</span>
                    <ChevronDown className="h-3 w-3 text-ink-tertiary" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Switch role</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {ROLES.map((r) => {
                    const RoleIcon = r.icon;
                    const active = r.id === role;
                    return (
                        <DropdownMenuItem
                            key={r.id}
                            onSelect={() => {
                                setRole(r.id);
                                router.push(r.landing);
                            }}
                            className="flex items-start gap-3 py-2"
                        >
                            <span className="h-7 w-7 rounded-lg bg-canvas-muted border border-stroke-subtle flex items-center justify-center shrink-0 mt-0.5">
                                <RoleIcon className="h-3.5 w-3.5 text-ink-secondary" />
                            </span>
                            <span className="flex-1">
                                <span className="block text-sm text-ink-primary font-medium">{r.label}</span>
                                <span className="block text-xs text-ink-tertiary">{r.subtitle}</span>
                            </span>
                            {active && <Check className="h-3.5 w-3.5 text-accent mt-1" />}
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
