"use client";

import * as React from "react";
import { ChevronDown, LogOut, Shield, User } from "lucide-react";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth/AuthContext";

function initialsFor(firstName: string | null, lastName: string | null, email: string): string {
    const a = firstName?.[0] ?? "";
    const b = lastName?.[0] ?? "";
    if (a || b) return (a + b).toUpperCase();
    return email[0]?.toUpperCase() ?? "?";
}

export function UserMenu() {
    const { me, signOut } = useAuth();

    if (!me) return null;
    const { user } = me;
    const Icon = user.role === "admin" ? Shield : User;
    const fullName =
        [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="flex items-center gap-2 rounded-full border border-stroke-subtle bg-canvas-raised hover:bg-canvas-overlay transition-colors pl-1 pr-2.5 h-8 text-xs"
                    aria-label="Open account menu"
                >
                    <span className="h-6 w-6 rounded-full bg-accent-bg border border-accent-border flex items-center justify-center text-[10px] font-semibold text-accent">
                        {initialsFor(user.firstName, user.lastName, user.email)}
                    </span>
                    <span className="hidden sm:inline text-ink-primary font-medium max-w-[10rem] truncate">
                        {fullName}
                    </span>
                    <ChevronDown className="h-3 w-3 text-ink-tertiary" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-ink-secondary" />
                    <span className="text-xs text-ink-secondary capitalize">{user.role}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5 text-xs text-ink-tertiary">
                    <div className="text-ink-primary font-medium truncate">{fullName}</div>
                    <div className="truncate">{user.email}</div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void signOut()} className="gap-2">
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign out</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
