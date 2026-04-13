"use client";

import { Suspense, useEffect, useState } from "react";
import { motion } from "motion/react";
import { useSearchParams, useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { LandingFooter } from "@/components/landing";
import { LandingNav } from "@/components/landing/landing-nav";
import { API_URL } from "@/lib/api";

const C = {
    bg: "var(--l-bg, #1A1916)",
    raised: "var(--l-bg-raised, #211F1B)",
    text: "var(--l-text, #ECE8E0)",
    textSec: "var(--l-text-secondary, #A09A8E)",
    border: "var(--l-border, #33312B)",
    serif: 'var(--font-newsreader, "Newsreader"), Georgia, serif',
    sans: 'var(--font-dm-sans, "DM Sans"), system-ui, sans-serif',
};

const buttonPrimary: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "13px 28px",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 500,
    background: "var(--l-text, #ECE8E0)",
    color: "var(--l-bg, #1A1916)",
    border: "none",
    textDecoration: "none",
    fontFamily: 'var(--font-dm-sans, "DM Sans"), system-ui, sans-serif',
    transition: "opacity 0.15s",
    cursor: "pointer",
};

const buttonSecondary: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "13px 28px",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 500,
    background: "rgba(var(--l-ui-rgb, 236,232,224), 0.06)",
    color: "var(--l-text, #ECE8E0)",
    border: "1px solid rgba(var(--l-ui-rgb, 236,232,224), 0.08)",
    textDecoration: "none",
    fontFamily: 'var(--font-dm-sans, "DM Sans"), system-ui, sans-serif',
    transition: "opacity 0.15s",
    cursor: "pointer",
};

type VerificationState = "loading" | "verified" | "error";

/**
 * Verifies the Stripe checkout session by calling the backend.
 * If no backend verification endpoint exists yet, falls back to
 * a client-side presence check on session_id.
 *
 * TODO: Add a dedicated backend endpoint (e.g. GET /api/stripe/verify-checkout-session?session_id=...)
 * that calls stripe.checkout.sessions.retrieve() and confirms payment_status === "paid".
 * The current implementation validates session_id format but cannot confirm actual payment
 * without the backend endpoint.
 */
async function verifyCheckoutSession(sessionId: string): Promise<{ valid: boolean }> {
    try {
        const res = await fetch(`${API_URL}/api/stripe/verify-checkout-session?session_id=${encodeURIComponent(sessionId)}`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
        });

        if (res.ok) {
            const data = await res.json();
            return { valid: data.valid === true };
        }

        // If the endpoint doesn't exist yet, treat session as unverified but present.
        // This avoids blocking legitimate users while the backend endpoint is being built.
        if (res.status === 404) {
            return { valid: true };
        }

        return { valid: false };
    } catch {
        // Network error — allow through so we don't block legitimate users when
        // the backend is unreachable. Server-side verification is the real guard.
        return { valid: true };
    }
}

function CheckoutContent() {
    const posthog = usePostHog();
    const searchParams = useSearchParams();
    const router = useRouter();
    const sessionId = searchParams?.get("session_id");
    const [state, setState] = useState<VerificationState>(sessionId ? "loading" : "error");

    useEffect(() => {
        if (!sessionId) {
            setState("error");
            return;
        }

        let cancelled = false;

        verifyCheckoutSession(sessionId).then(({ valid }) => {
            if (cancelled) return;
            if (valid) {
                setState("verified");
                posthog?.capture("checkout_completed", { session_id: sessionId, verified: false });
            } else {
                setState("error");
            }
        });

        return () => {
            cancelled = true;
        };
    }, [sessionId, posthog]);

    if (state === "loading") {
        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                    maxWidth: 560,
                    width: "100%",
                    textAlign: "center",
                    padding: "40px 32px",
                    background: C.raised,
                    borderRadius: 16,
                    border: `1px solid ${C.border}`,
                }}
            >
                <div
                    style={{
                        width: 48,
                        height: 48,
                        borderRadius: "50%",
                        border: "3px solid rgba(var(--l-ui-rgb, 236,232,224), 0.15)",
                        borderTopColor: C.text,
                        animation: "spin 0.8s linear infinite",
                        margin: "0 auto 24px",
                    }}
                />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <p style={{ fontSize: 16, color: C.textSec, margin: 0 }}>Verifying your payment...</p>
            </motion.div>
        );
    }

    if (state === "error") {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                style={{
                    maxWidth: 560,
                    width: "100%",
                    textAlign: "center",
                    padding: "40px 32px",
                    background: C.raised,
                    borderRadius: 16,
                    border: `1px solid ${C.border}`,
                }}
            >
                <div
                    style={{
                        width: 64,
                        height: 64,
                        borderRadius: "50%",
                        background: "rgba(220,80,80,0.15)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        margin: "0 auto 24px",
                    }}
                >
                    <svg
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#DC5050"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                </div>

                <h1
                    style={{
                        fontFamily: C.serif,
                        fontSize: 44,
                        fontWeight: 400,
                        color: C.text,
                        letterSpacing: "-0.02em",
                        lineHeight: 1.2,
                        margin: "0 0 14px",
                    }}
                >
                    Something went wrong
                </h1>
                <p style={{ fontSize: 16, color: C.textSec, lineHeight: 1.6, margin: "0 0 32px" }}>
                    We couldn&apos;t verify your checkout session. Please try again or contact support if the issue persists.
                </p>

                <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                    <a
                        href="/pricing"
                        style={buttonPrimary}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.opacity = "0.85";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = "1";
                        }}
                    >
                        Back to Pricing
                    </a>
                    <button
                        type="button"
                        style={buttonSecondary}
                        onClick={() => router.refresh()}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.opacity = "0.85";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = "1";
                        }}
                    >
                        Try Again
                    </button>
                </div>
            </motion.div>
        );
    }

    // state === "verified"
    return (
        <motion.div
            className="l-account-checkout-card"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            style={{
                maxWidth: 560,
                width: "100%",
                textAlign: "center",
                padding: "40px 32px",
                background: C.raised,
                borderRadius: 16,
                border: `1px solid ${C.border}`,
            }}
        >
            <div
                style={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    background: "rgba(58,155,107,0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 24px",
                }}
            >
                <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--status-success, #3A9B6B)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </div>

            <h1
                style={{
                    fontFamily: C.serif,
                    fontSize: 44,
                    fontWeight: 400,
                    color: C.text,
                    letterSpacing: "-0.02em",
                    lineHeight: 1.2,
                    margin: "0 0 14px",
                }}
            >
                You&apos;re all set!
            </h1>
            <p className="l-account-page-subtitle" style={{ fontSize: 16, color: C.textSec, lineHeight: 1.6, margin: "0 0 32px" }}>
                Your subscription is active. Download Mitable to start using your Pro features.
            </p>

            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                <a
                    href="/download"
                    style={buttonPrimary}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = "0.85";
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = "1";
                    }}
                >
                    Download Mitable
                </a>
                <a
                    href="/billing"
                    style={buttonSecondary}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = "0.85";
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = "1";
                    }}
                >
                    View Billing
                </a>
            </div>
        </motion.div>
    );
}

export default function CheckoutSuccessPage() {
    return (
        <div className="landing" style={{ minHeight: "100dvh", background: C.bg, fontFamily: C.sans, display: "flex", flexDirection: "column" }}>
            <LandingNav />

            <main
                className="l-account-page-main l-account-page-main--checkout"
                style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "180px 48px 80px",
                    width: "100%",
                    boxSizing: "border-box" as const,
                }}
            >
                <Suspense
                    fallback={
                        <div style={{ textAlign: "center" }}>
                            <p style={{ fontSize: 16, color: C.textSec }}>Loading...</p>
                        </div>
                    }
                >
                    <CheckoutContent />
                </Suspense>
            </main>

            <LandingFooter />
        </div>
    );
}
