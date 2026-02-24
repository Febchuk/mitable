"use client";

import { Suspense, useState, useEffect, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { MitableHeader } from "@/components/marketing/header-navigation/mitable-header";
import { Input } from "@/components/base/input/input";
import { Button } from "@/components/base/buttons/button";
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

    // If already logged in, redirect
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                window.location.href = redirect;
            }
        });
    }, [redirect]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const { error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (authError) {
                setError(authError.message);
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
                <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight text-white md:text-5xl">
                    Sign In
                </h1>
                <p className="mt-4 text-lg text-gray-400">
                    Sign in to manage your subscription and billing.
                </p>
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

                <Button
                    type="submit"
                    color="primary"
                    size="lg"
                    className="btn-pill mt-2 w-full"
                    isDisabled={loading}
                >
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
                        className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2"
                        style={{
                            width: "800px",
                            height: "600px",
                            background:
                                "radial-gradient(50% 50% at 50% 50%, rgba(138,97,247,0.06) 0%, transparent 100%)",
                        }}
                    />

                    <div className="relative mx-auto max-w-container px-4 py-20 md:px-8 md:py-28 lg:py-36">
                        <a
                            href="/"
                            className="mb-12 inline-flex items-center gap-2 font-mono text-sm text-gray-400 transition-colors hover:text-white"
                        >
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
