"use client";

import { useRouter } from "next/navigation";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingFooter } from "@/components/landing";

const C = {
    bg: "var(--l-bg, #1A1916)",
    text: "var(--l-text, #ECE8E0)",
    textSec: "var(--l-text-secondary, #A09A8E)",
    textTer: "var(--l-text-tertiary, #6B665C)",
    accent: "var(--l-accent, #82C0CC)",
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

export default function NotFound() {
    const router = useRouter();

    return (
        <div className="landing" style={{ minHeight: "100dvh", background: C.bg, fontFamily: C.sans }}>
            <LandingNav />

            <main style={{ padding: "180px 48px 80px", maxWidth: 640, margin: "0 auto" }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: C.accent, marginBottom: 14 }}>404 error</p>
                <h1 style={{ fontFamily: C.serif, fontSize: 52, fontWeight: 400, color: C.text, letterSpacing: "-0.02em", lineHeight: 1.15, margin: "0 0 18px" }}>
                    We can&apos;t find that page
                </h1>
                <p style={{ fontSize: 18, color: C.textSec, lineHeight: 1.6, margin: "0 0 40px" }}>
                    Sorry, the page you are looking for doesn&apos;t exist or has been moved.
                </p>

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <button
                        onClick={() => router.back()}
                        style={buttonSecondary}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                    >
                        Go back
                    </button>
                    <a
                        href="/"
                        style={buttonPrimary}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                    >
                        Take me home
                    </a>
                </div>
            </main>

            <LandingFooter />
        </div>
    );
}
