"use client";

import { type FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { MitableHeader } from "@/components/marketing/header-navigation/mitable-header";
import { API_URL } from "@/lib/api";
import { supabase } from "@/lib/supabase";

const darkInput = {
    wrapperClassName: "!bg-gray-900/50 !ring-gray-800/60 focus-within:!ring-brand",
    inputClassName: "!text-white !placeholder-gray-500",
};

function LoginForm() {
    const searchParams = useSearchParams();
    const redirect = searchParams.get("redirect") || "/billing";

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // If already logged in with a valid session, redirect
    useEffect(() => {
        supabase.auth.getSession().then(async ({ data: { session } }) => {
            if (!session) return;
            try {
                const res = await fetch(`${API_URL}/api/auth/me`, {
                    headers: { Authorization: `Bearer ${session.access_token}` },
                });
                if (res.ok) {
                    window.location.href = redirect;
                } else {
                    await supabase.auth.signOut();
                }
            } catch {
                await supabase.auth.signOut();
            }
        });
    }, [redirect]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const { data: signInData, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (authError) {
                setError(authError.message);
                return;
            }

            // Verify the user has a backend profile (org + subscription)
            const meRes = await fetch(`${API_URL}/api/auth/me`, {
                headers: { Authorization: `Bearer ${signInData.session?.access_token}` },
            });

            if (meRes.status === 404) {
                // User exists in Auth but has no DB profile (orphaned from old signup).
                // Auto-repair: call signup-organization which handles orphan cleanup + creates org/user/subscription.
                await supabase.auth.signOut();

                const fullName = signInData.user?.user_metadata?.full_name || "";
                const nameParts = fullName.trim().split(/\s+/);
                const firstName = nameParts[0] || email.split("@")[0];
                const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "User";

                const repairRes = await fetch(`${API_URL}/api/auth/signup-organization`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        email,
                        password,
                        firstName,
                        lastName,
                        organizationName: `${firstName}'s Workspace`,
                        accountType: "personal",
                    }),
                });

                const repairData = await repairRes.json();

                if (!repairRes.ok) {
                    setError(repairData.error?.message || "Failed to set up your account. Please try signing up instead.");
                    return;
                }

                if (repairData.session?.access_token && repairData.session?.refresh_token) {
                    await supabase.auth.setSession({
                        access_token: repairData.session.access_token,
                        refresh_token: repairData.session.refresh_token,
                    });
                }

                window.location.href = redirect;
                return;
            }

            if (!meRes.ok) {
                await supabase.auth.signOut();
                setError("Something went wrong verifying your account. Please try again.");
                return;
            }

            window.location.href = redirect;
        } catch {
            setError("An unexpected error occurred.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <div className="mb-12 text-center">
                <h1 className="font-display text-4xl font-extrabold tracking-tight text-white uppercase md:text-5xl">Sign In</h1>
                <p className="mt-4 text-lg text-gray-400">Sign in to manage your subscription and billing.</p>
            </div>

            <form onSubmit={handleSubmit} className="mx-auto flex max-w-md flex-col gap-5">
                <Input
                    label="Email"
                    placeholder="you@company.com"
                    type="email"
                    isRequired
                    value={email}
                    onChange={setEmail}
                    wrapperClassName={darkInput.wrapperClassName}
                    inputClassName={darkInput.inputClassName}
                />

                <Input
                    label="Password"
                    placeholder="Your password"
                    type="password"
                    isRequired
                    value={password}
                    onChange={setPassword}
                    wrapperClassName={darkInput.wrapperClassName}
                    inputClassName={darkInput.inputClassName}
                />

                {error && <p className="text-sm text-red-400">{error}</p>}

                <Button type="submit" color="primary" size="lg" className="btn-pill mt-2 w-full" isDisabled={loading}>
                    {loading ? "Signing in..." : "Sign In"}
                </Button>

                <p className="text-center text-sm text-gray-500">
                    Don&apos;t have an account?{" "}
                    <a href={`/signup?redirect=${encodeURIComponent(redirect)}`} className="text-brand-400 hover:text-brand-300">
                        Sign up
                    </a>
                </p>
            </form>
        </>
    );
}

export default function LoginPage() {
    return (
        <div className="flex min-h-dvh flex-col bg-ink">
            <MitableHeader />

            <main className="flex-1 pt-18 md:pt-20">
                <section className="relative overflow-hidden">
                    <div
                        className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2"
                        style={{
                            width: "800px",
                            height: "600px",
                            background: "radial-gradient(50% 50% at 50% 50%, rgba(138,97,247,0.06) 0%, transparent 100%)",
                        }}
                    />

                    <div className="relative mx-auto max-w-container px-4 py-20 md:px-8 md:py-28 lg:py-36">
                        <a href="/" className="mb-12 inline-flex items-center gap-2 font-mono text-sm text-gray-400 transition-colors hover:text-white">
                            <svg
                                className="size-4"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <line x1="19" y1="12" x2="5" y2="12" />
                                <polyline points="12 19 5 12 12 5" />
                            </svg>
                            Back to home
                        </a>

                        <Suspense>
                            <LoginForm />
                        </Suspense>
                    </div>
                </section>
            </main>
        </div>
    );
}
