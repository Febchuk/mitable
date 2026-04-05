"use client";

import { type FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingFooter } from "@/components/landing";
import { API_URL } from "@/lib/api";
import { supabase } from "@/lib/supabase";

const C = {
    bg: "var(--l-bg, #1A1916)",
    raised: "var(--l-bg-raised, #211F1B)",
    text: "var(--l-text, #ECE8E0)",
    textSec: "var(--l-text-secondary, #A09A8E)",
    textTer: "var(--l-text-tertiary, #6B665C)",
    accent: "var(--l-accent, #82C0CC)",
    border: "var(--l-border, #33312B)",
    serif: 'var(--font-newsreader, "Newsreader"), Georgia, serif',
    sans: 'var(--font-dm-sans, "DM Sans"), system-ui, sans-serif',
};

const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    fontSize: 14,
    color: "var(--l-text, #ECE8E0)",
    background: "rgba(var(--l-ui-rgb, 236, 232, 224), 0.04)",
    border: "1px solid rgba(var(--l-ui-rgb, 236, 232, 224), 0.08)",
    borderRadius: 10,
    outline: "none",
    fontFamily: 'var(--font-dm-sans, "DM Sans"), system-ui, sans-serif',
    transition: "border-color 0.15s",
};

function LoginForm() {
    const searchParams = useSearchParams();
    const redirect = searchParams.get("redirect") || "/billing";

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

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

            const meRes = await fetch(`${API_URL}/api/auth/me`, {
                headers: { Authorization: `Bearer ${signInData.session?.access_token}` },
            });

            if (meRes.status === 404) {
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
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 400, margin: "0 auto" }}>
            <div>
                <label style={{ display: "block", fontSize: 10, color: C.textTer, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 8 }}>Email *</label>
                <input required type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
            </div>

            <div>
                <label style={{ display: "block", fontSize: 10, color: C.textTer, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 8 }}>Password *</label>
                <input required type="password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
            </div>

            {error && <p style={{ fontSize: 13, color: "var(--status-error, #E87474)", margin: 0 }}>{error}</p>}

            <button
                type="submit"
                disabled={loading}
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "13px 0",
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 500,
                    background: C.text,
                    color: C.bg,
                    border: "none",
                    cursor: loading ? "wait" : "pointer",
                    fontFamily: C.sans,
                    transition: "opacity 0.15s",
                    width: "100%",
                    opacity: loading ? 0.7 : 1,
                }}
            >
                {loading ? "Signing in..." : "Sign In"}
            </button>

            <p style={{ textAlign: "center", fontSize: 13, color: C.textTer, margin: 0 }}>
                Don&apos;t have an account?{" "}
                <a href={`/signup?redirect=${encodeURIComponent(redirect)}`} style={{ color: C.accent, textDecoration: "none" }}>
                    Sign up
                </a>
            </p>
        </form>
    );
}

export default function LoginPage() {
    return (
        <div className="landing" style={{ minHeight: "100dvh", background: C.bg, fontFamily: C.sans, display: "flex", flexDirection: "column" }}>
            <LandingNav />

            <main
                className="l-account-page-main"
                style={{ flex: 1, padding: "180px 48px 80px", maxWidth: 640, margin: "0 auto", width: "100%", boxSizing: "border-box" as const }}
            >
                <div className="l-account-page-header" style={{ textAlign: "center", marginBottom: 48 }}>
                    <h1 style={{ fontFamily: C.serif, fontSize: 44, fontWeight: 400, color: C.text, letterSpacing: "-0.02em", lineHeight: 1.2, margin: "0 0 14px" }}>
                        Sign In
                    </h1>
                    <p className="l-account-page-subtitle" style={{ fontSize: 16, color: C.textSec, lineHeight: 1.6, margin: 0 }}>
                        Sign in to manage your subscription and billing.
                    </p>
                </div>

                <Suspense>
                    <LoginForm />
                </Suspense>
            </main>

            <LandingFooter />
        </div>
    );
}
