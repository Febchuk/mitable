"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/api/supabase";
import { apiRequest, ApiError } from "@/lib/api/client";
import type { MontessoriMe } from "@/lib/auth/AuthContext";

function landingRouteFor(me: MontessoriMe): string {
    if (me.user.role === "admin") return "/admin/dashboard";
    if (me.assignedClassroom?.level === "elementary") return "/teacher/grid";
    return "/teacher/grid";
}

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = React.useState("");
    const [password, setPassword] = React.useState("");
    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [bootChecking, setBootChecking] = React.useState(true);

    // If a session is already alive when /login mounts, route the user
    // straight to their landing page instead of showing the form.
    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data } = await supabase.auth.getSession();
            if (cancelled) return;
            if (!data.session) {
                setBootChecking(false);
                return;
            }
            try {
                const me = await apiRequest<MontessoriMe>("/montessori/me");
                if (cancelled) return;
                router.replace(landingRouteFor(me));
            } catch (err) {
                if (err instanceof ApiError && err.status === 401) {
                    await supabase.auth.signOut().catch(() => undefined);
                }
                if (!cancelled) setBootChecking(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [router]);

    const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (signInError) throw new Error(signInError.message);
            const me = await apiRequest<MontessoriMe>("/montessori/me");
            router.replace(landingRouteFor(me));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Sign in failed");
            setSubmitting(false);
        }
    };

    if (bootChecking) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-canvas-base">
                <Loader2 className="h-5 w-5 text-ink-tertiary animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-canvas-base px-4">
            <div className="w-full max-w-sm">
                <div className="mb-8 text-center">
                    <h1 className="font-display text-2xl text-ink-primary mb-1">
                        Mitable for Montessori
                    </h1>
                    <p className="text-sm text-ink-secondary">
                        Sign in to your school workspace.
                    </p>
                </div>

                <form
                    onSubmit={onSubmit}
                    className="space-y-3 rounded-2xl border border-stroke-subtle bg-canvas-raised p-5"
                >
                    <div className="space-y-1.5">
                        <Label htmlFor="email" className="text-xs text-ink-secondary">
                            Email
                        </Label>
                        <Input
                            id="email"
                            type="email"
                            autoComplete="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={submitting}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="password" className="text-xs text-ink-secondary">
                            Password
                        </Label>
                        <Input
                            id="password"
                            type="password"
                            autoComplete="current-password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={submitting}
                        />
                    </div>

                    {error && (
                        <div
                            role="alert"
                            className="rounded-md border border-status-error/30 bg-status-error/10 px-3 py-2 text-xs text-status-error"
                        >
                            {error}
                        </div>
                    )}

                    <Button type="submit" className="w-full" disabled={submitting}>
                        {submitting ? (
                            <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Signing in…
                            </>
                        ) : (
                            "Sign in"
                        )}
                    </Button>
                </form>

                <p className="mt-4 text-center text-[11px] text-ink-tertiary">
                    For child privacy, photos and audio must be captured in the app and stay in your
                    school workspace.
                </p>
            </div>
        </div>
    );
}
