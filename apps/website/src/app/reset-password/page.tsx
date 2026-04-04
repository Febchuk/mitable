"use client";

import { type FormEvent, useEffect, useState } from "react";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingFooter } from "@/components/landing";
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

const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    paddingRight: 44,
    fontSize: 14,
    color: "var(--l-text, #ECE8E0)",
    background: "rgba(var(--l-ui-rgb, 236, 232, 224), 0.04)",
    border: "1px solid rgba(var(--l-ui-rgb, 236, 232, 224), 0.08)",
    borderRadius: 10,
    outline: "none",
    fontFamily: 'var(--font-dm-sans, "DM Sans"), system-ui, sans-serif',
    transition: "border-color 0.15s",
};

const eyeButtonStyle: React.CSSProperties = {
    position: "absolute",
    right: 12,
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    color: "var(--l-text-tertiary, #6B665C)",
    cursor: "pointer",
    padding: 4,
    display: "flex",
    alignItems: "center",
};

const EyeIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

const EyeOffIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
);

export default function ResetPasswordPage() {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [status, setStatus] = useState<"loading" | "ready" | "success" | "error">("loading");
    const [errorMessage, setErrorMessage] = useState("");

    useEffect(() => {
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event) => {
            if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
                setStatus("ready");
            }
        });

        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                setStatus("ready");
            } else {
                setTimeout(() => {
                    supabase.auth.getSession().then(({ data: { session: s } }) => {
                        if (!s && status === "loading") {
                            setStatus("error");
                            setErrorMessage("Invalid or expired reset link. Please request a new one.");
                        }
                    });
                }, 2000);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setErrorMessage("");

        if (password !== confirmPassword) {
            setErrorMessage("Passwords do not match.");
            return;
        }

        if (password.length < 8) {
            setErrorMessage("Password must be at least 8 characters.");
            return;
        }

        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) {
                setErrorMessage(error.message);
                return;
            }
            setStatus("success");
        } catch {
            setErrorMessage("An unexpected error occurred. Please try again.");
        }
    };

    return (
        <div className="landing" style={{ minHeight: "100dvh", background: C.bg, fontFamily: C.sans, display: "flex", flexDirection: "column" }}>
            <LandingNav />

            <main style={{ flex: 1, padding: "180px 48px 80px", maxWidth: 640, margin: "0 auto", width: "100%", boxSizing: "border-box" as const }}>
                <div style={{ textAlign: "center", marginBottom: 48 }}>
                    <h1 style={{ fontFamily: C.serif, fontSize: 44, fontWeight: 400, color: C.text, letterSpacing: "-0.02em", lineHeight: 1.2, margin: "0 0 14px" }}>
                        {status === "success" ? "Password Updated" : "Set New Password"}
                    </h1>
                    <p style={{ fontSize: 16, color: C.textSec, lineHeight: 1.6, margin: 0 }}>
                        {status === "loading" && "Verifying your reset link..."}
                        {status === "ready" && "Enter your new password below."}
                        {status === "success" && "Your password has been successfully updated."}
                        {status === "error" && "There was a problem with your reset link."}
                    </p>
                </div>

                <div style={{ maxWidth: 400, margin: "0 auto" }}>
                    {status === "loading" && (
                        <div style={{ display: "flex", justifyContent: "center", padding: "20px 0" }}>
                            <div
                                style={{
                                    width: 32,
                                    height: 32,
                                    border: "2px solid rgba(var(--l-ui-rgb, 236,232,224), 0.15)",
                                    borderTop: `2px solid ${C.accent}`,
                                    borderRadius: "50%",
                                    animation: "spin 0.8s linear infinite",
                                }}
                            />
                        </div>
                    )}

                    {status === "ready" && (
                        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                            <div>
                                <label style={{ display: "block", fontSize: 10, color: C.textTer, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 8 }}>New Password *</label>
                                <div style={{ position: "relative" }}>
                                    <input
                                        required
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Enter new password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        style={inputStyle}
                                    />
                                    <button type="button" onClick={() => setShowPassword(!showPassword)} style={eyeButtonStyle} aria-label={showPassword ? "Hide password" : "Show password"}>
                                        {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label style={{ display: "block", fontSize: 10, color: C.textTer, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 8 }}>Confirm Password *</label>
                                <div style={{ position: "relative" }}>
                                    <input
                                        required
                                        type={showConfirmPassword ? "text" : "password"}
                                        placeholder="Confirm new password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        style={inputStyle}
                                    />
                                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} style={eyeButtonStyle} aria-label={showConfirmPassword ? "Hide password" : "Show password"}>
                                        {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                                    </button>
                                </div>
                            </div>

                            {errorMessage && <p style={{ fontSize: 13, color: "var(--status-error, #E87474)", margin: 0 }}>{errorMessage}</p>}

                            <button
                                type="submit"
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
                                    cursor: "pointer",
                                    fontFamily: C.sans,
                                    transition: "opacity 0.15s",
                                    width: "100%",
                                    marginTop: 4,
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                            >
                                Update Password
                            </button>
                        </form>
                    )}

                    {status === "success" && (
                        <div
                            style={{
                                borderRadius: 16,
                                border: `1px solid ${C.border}`,
                                background: C.raised,
                                padding: 32,
                                textAlign: "center",
                            }}
                        >
                            <div
                                style={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: "50%",
                                    background: "rgba(58,155,107,0.15)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    margin: "0 auto 16px",
                                }}
                            >
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--status-success, #3A9B6B)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            </div>
                            <p style={{ fontSize: 15, color: C.textSec, marginBottom: 24 }}>You can now sign in with your new password.</p>
                            <a
                                href="/login"
                                style={{
                                    display: "inline-flex",
                                    padding: "13px 28px",
                                    borderRadius: 10,
                                    fontSize: 14,
                                    fontWeight: 500,
                                    background: C.text,
                                    color: C.bg,
                                    textDecoration: "none",
                                    fontFamily: C.sans,
                                    transition: "opacity 0.15s",
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                            >
                                Sign in
                            </a>
                        </div>
                    )}

                    {status === "error" && (
                        <div
                            style={{
                                borderRadius: 16,
                                border: "1px solid rgba(232,116,116,0.2)",
                                background: "rgba(232,116,116,0.05)",
                                padding: 32,
                                textAlign: "center",
                            }}
                        >
                            <div
                                style={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: "50%",
                                    background: "rgba(232,116,116,0.15)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    margin: "0 auto 16px",
                                }}
                            >
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--status-error, #E87474)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="15" y1="9" x2="9" y2="15" />
                                    <line x1="9" y1="9" x2="15" y2="15" />
                                </svg>
                            </div>
                            <p style={{ fontSize: 15, color: C.textSec, marginBottom: 24 }}>{errorMessage}</p>
                            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                                <a
                                    href="/login"
                                    style={{
                                        display: "inline-flex",
                                        padding: "13px 28px",
                                        borderRadius: 10,
                                        fontSize: 14,
                                        fontWeight: 500,
                                        background: C.text,
                                        color: C.bg,
                                        textDecoration: "none",
                                        fontFamily: C.sans,
                                        transition: "opacity 0.15s",
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                                >
                                    Sign in
                                </a>
                                <a
                                    href="/"
                                    style={{
                                        display: "inline-flex",
                                        padding: "13px 28px",
                                        borderRadius: 10,
                                        fontSize: 14,
                                        fontWeight: 500,
                                        background: "rgba(var(--l-ui-rgb, 236,232,224), 0.06)",
                                        color: C.text,
                                        textDecoration: "none",
                                        fontFamily: C.sans,
                                        transition: "opacity 0.15s",
                                        border: "1px solid rgba(var(--l-ui-rgb, 236,232,224), 0.08)",
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                                >
                                    Home
                                </a>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            <LandingFooter />
        </div>
    );
}
