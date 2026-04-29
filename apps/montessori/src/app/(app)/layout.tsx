"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/lib/auth/AuthContext";
import { StoreProvider } from "@/lib/store";
import { QueryProvider } from "@/lib/query/QueryProvider";
import { AppShell } from "@/components/shell/AppShell";
import { OfflinePill } from "@/components/system/OfflinePill";

/**
 * Auth gate + app shell.
 *
 * Anything under app/(app)/** lives behind a real Supabase session. The
 * route group is invisible in URLs — /admin/dashboard and /teacher/grid
 * are unchanged for users — but it lets us run an auth check + render
 * the AppShell only on protected pages, so /login (which sits at the
 * root layout) doesn't get the sidebar.
 *
 * State machine:
 *   loading    → centered spinner (no redirect yet, avoids flicker)
 *   signed-out → redirect to /login
 *   error      → minimal error screen with a sign-out escape hatch
 *   signed-in  → StoreProvider + AppShell + page content
 */
export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const { status, error, signOut } = useAuth();

    React.useEffect(() => {
        if (status === "signed-out") {
            router.replace("/login");
        }
    }, [status, router]);

    if (status === "loading" || status === "signed-out") {
        return (
            <div
                className="min-h-screen flex items-center justify-center"
                style={{ background: "var(--bg-base)" }}
            >
                <Loader2 className="h-5 w-5 text-ink-tertiary animate-spin" />
            </div>
        );
    }

    if (status === "error") {
        return (
            <div
                className="min-h-screen flex items-center justify-center px-4"
                style={{ background: "var(--bg-base)" }}
            >
                <div className="max-w-sm rounded-2xl border border-stroke-subtle bg-canvas-raised p-5 text-center space-y-3">
                    <h2 className="text-sm font-semibold text-ink-primary">
                        Something went wrong loading your workspace.
                    </h2>
                    <p className="text-xs text-ink-secondary">
                        {error ?? "Please sign in again to continue."}
                    </p>
                    <button
                        type="button"
                        onClick={() => void signOut()}
                        className="w-full h-9 text-xs rounded-md border border-stroke-subtle text-ink-primary hover:bg-canvas-muted"
                    >
                        Sign out
                    </button>
                </div>
            </div>
        );
    }

    return (
        <QueryProvider>
            <StoreProvider>
                <AppShell>{children}</AppShell>
                <OfflinePill />
            </StoreProvider>
        </QueryProvider>
    );
}
