"use client";

import { motion } from "motion/react";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingFooter } from "@/components/landing";

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

export default function CheckoutCancelPage() {
    return (
        <div className="landing" style={{ minHeight: "100dvh", background: C.bg, fontFamily: C.sans, display: "flex", flexDirection: "column" }}>
            <LandingNav />

            <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "180px 48px 80px", width: "100%", boxSizing: "border-box" as const }}>
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
                    <h1 style={{ fontFamily: C.serif, fontSize: 44, fontWeight: 400, color: C.text, letterSpacing: "-0.02em", lineHeight: 1.2, margin: "0 0 14px" }}>
                        Checkout cancelled
                    </h1>
                    <p style={{ fontSize: 16, color: C.textSec, lineHeight: 1.6, margin: "0 0 32px" }}>
                        No worries &mdash; you can upgrade anytime. Your free plan is still active.
                    </p>

                    <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                        <a
                            href="/pricing"
                            style={buttonPrimary}
                            onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                        >
                            View Plans
                        </a>
                        <a
                            href="/"
                            style={buttonSecondary}
                            onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                        >
                            Back to Home
                        </a>
                    </div>
                </motion.div>
            </main>

            <LandingFooter />
        </div>
    );
}
