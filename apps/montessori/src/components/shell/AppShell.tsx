"use client";

import * as React from "react";

import { TitleBar } from "@/components/shell/TitleBar";
import { AdminSidebar } from "@/components/shell/AdminSidebar";
import { TeacherSidebar } from "@/components/shell/TeacherSidebar";
import { TeacherTabBar } from "@/components/shell/TeacherTabBar";
import { useStore } from "@/lib/store";

export function AppShell({ children }: { children: React.ReactNode }) {
    const { role } = useStore();

    return (
        <div
            className="flex h-screen overflow-hidden"
            style={{ background: "var(--bg-base)", fontFamily: "var(--font-sans)" }}
        >
            {/* Desktop sidebar — teacher uses one too on wide screens */}
            <div className="hidden md:flex">
                {role === "admin" ? <AdminSidebar /> : <TeacherSidebar />}
            </div>

            <div className="flex-1 flex flex-col min-w-0 relative">
                <TitleBar />
                <main className="flex-1 min-h-0 overflow-auto">
                    <div className="w-full h-full">{children}</div>
                </main>
                {/* Mobile tab bar for teachers only */}
                {role !== "admin" && (
                    <div className="md:hidden">
                        <TeacherTabBar />
                    </div>
                )}
            </div>
        </div>
    );
}
