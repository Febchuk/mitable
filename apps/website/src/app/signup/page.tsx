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

function SignupForm() {
    const searchParams = useSearchParams();
    const redirect = searchParams.get("redirect") || "/billing";

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
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

        if (password.length < 8) {
            setError("Password must be at least 8 characters.");
            setLoading(false);
            return;
        }

        try {
            const res = await fetch(`${API_URL}/api/auth/signup-organization`, {
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

            const data = await res.json();

            if (!res.ok) {
                setError(data.error?.message || "Signup failed. Please try again.");
                return;
            }

            if (data.session?.access_token && data.session?.refresh_token) {
                await supabase.auth.setSession({
                    access_token: data.session.access_token,
                    refresh_token: data.session.refresh_token,
                });
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                    <label style={{ display: "block", fontSize: 10, color: C.textTer, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 8 }}>First Name *</label>
                    <input required placeholder="Jane" value={firstName} onChange={(e) => setFirstName(e.target.value)} style={inputStyle} />
                </div>
                <div>
                    <label style={{ display: "block", fontSize: 10, color: C.textTer, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 8 }}>Last Name *</label>
                    <input required placeholder="Smith" value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputStyle} />
                </div>
            </div>

            <div>
                <label style={{ display: "block", fontSize: 10, color: C.textTer, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 8 }}>Email *</label>
                <input required type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
            </div>

            <div>
                <label style={{ display: "block", fontSize: 10, color: C.textTer, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 8 }}>Password *</label>
                <input required type="password" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
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
                {loading ? "Creating account..." : "Create Account"}
            </button>

            <p style={{ textAlign: "center", fontSize: 13, color: C.textTer, margin: 0 }}>
                Already have an account?{" "}
                <a href={`/login?redirect=${encodeURIComponent(redirect)}`} style={{ color: C.accent, textDecoration: "none" }}>
                    Sign in
                </a>
            </p>
        </form>
    );
}

export default function SignupPage() {
    return (
        <div className="landing" style={{ minHeight: "100dvh", background: C.bg, fontFamily: C.sans, display: "flex", flexDirection: "column" }}>
            <LandingNav />

            <main style={{ flex: 1, padding: "180px 48px 80px", maxWidth: 640, margin: "0 auto", width: "100%", boxSizing: "border-box" as const }}>
                <div style={{ textAlign: "center", marginBottom: 48 }}>
                    <h1 style={{ fontFamily: C.serif, fontSize: 44, fontWeight: 400, color: C.text, letterSpacing: "-0.02em", lineHeight: 1.2, margin: "0 0 14px" }}>
                        Create Account
                    </h1>
                    <p style={{ fontSize: 16, color: C.textSec, lineHeight: 1.6, margin: 0 }}>
                        Sign up to get started with Mitable.
                    </p>
                </div>

                <Suspense>
                    <SignupForm />
                </Suspense>
            </main>

            <LandingFooter />
        </div>
    );
}
