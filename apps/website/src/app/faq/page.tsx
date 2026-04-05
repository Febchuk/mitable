"use client";

import { useState } from "react";
import { LandingFooter } from "@/components/landing";
import { LandingNav } from "@/components/landing/landing-nav";

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

const FAQS: { q: string; a: string }[] = [
    {
        q: "Can Mitable see everything on my team's screens?",
        a: "Mitable captures your team\u2019s screens as they work and uses AI to understand what they\u2019re doing \u2014 no integrations required. Employees can add apps or websites to a personal block list if they\u2019d like to keep certain things private.",
    },
    {
        q: "How does Mitable handle sensitive data?",
        a: "Block-listed apps and sites are never captured. Beyond that, a redaction pipeline strips PII and credentials before anything reaches our AI models. Data is stored on AWS using industry-standard security practices.",
    },
    {
        q: "Do I need to connect my team's tools or set up any integrations?",
        a: "No. Mitable works by understanding what\u2019s on the screen, so it works with any app your team uses \u2014 no integrations, permissions, or IT involvement required.",
    },
    {
        q: "Will my team feel like they're being watched minute by minute?",
        a: "No. Mitable generates narrative summaries of your team\u2019s work, not logs or replays. It\u2019s designed to give you meaningful visibility without creating a surveillance culture.",
    },
    {
        q: "How accurate are the work summaries?",
        a: "Because Mitable reads the screen directly, it understands actual work rather than inferred activity and is 99% accurate. Summaries reflect what your team genuinely did \u2014 not just which apps were open.",
    },
    {
        q: "Does Mitable work on Mac and Windows?",
        a: "Yes. Mitable runs on macOS and Windows and works the same regardless of which tools or workflows your team uses.",
    },
    {
        q: "Who can see my team's work data?",
        a: "Each employee can see their own summaries, and you as their manager have visibility into your team\u2019s work. Mitable doesn\u2019t sell or share data with third parties.",
    },
    {
        q: "Is Mitable a productivity tracker or a time tracker?",
        a: "Neither. Mitable is built around a more important question: is your team working on the right things? It understands what your team is actually doing and compares it against the benchmarks you\u2019ve set \u2014 so misalignment gets caught early, and effort gets directed where it matters most.",
    },
];

const FaqItem = ({ q, a }: { q: string; a: string }) => {
    const [open, setOpen] = useState(false);

    return (
        <div
            style={{
                borderBottom: `1px solid ${C.border}`,
            }}
        >
            <button
                onClick={() => setOpen(!open)}
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "22px 0",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    gap: 24,
                }}
            >
                <span
                    style={{
                        fontSize: 16,
                        fontWeight: 500,
                        color: C.text,
                        fontFamily: C.sans,
                        lineHeight: 1.4,
                    }}
                >
                    {q}
                </span>
                <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={C.textTer}
                    strokeWidth="2"
                    strokeLinecap="round"
                    style={{
                        flexShrink: 0,
                        transform: open ? "rotate(45deg)" : "rotate(0deg)",
                        transition: "transform 0.2s ease",
                    }}
                >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
            </button>
            <div
                style={{
                    overflow: "hidden",
                    maxHeight: open ? 400 : 0,
                    transition: "max-height 0.25s ease",
                }}
            >
                <p
                    style={{
                        fontSize: 14,
                        color: C.textSec,
                        lineHeight: 1.65,
                        margin: 0,
                        paddingBottom: 22,
                        paddingRight: 48,
                    }}
                >
                    {a}
                </p>
            </div>
        </div>
    );
};

export default function FaqPage() {
    return (
        <div className="landing" style={{ minHeight: "100dvh", background: C.bg, fontFamily: C.sans }}>
            <LandingNav />

            <main style={{ padding: "180px 48px 80px", maxWidth: 760, margin: "0 auto" }}>
                {/* Header */}
                <div style={{ marginBottom: 56 }}>
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
                        Frequently asked questions
                    </h1>
                    <p style={{ fontSize: 16, color: C.textSec, lineHeight: 1.6, margin: 0 }}>Everything you need to know about how Mitable works.</p>
                </div>

                {/* FAQ list */}
                <div style={{ borderTop: `1px solid ${C.border}` }}>
                    {FAQS.map((faq, i) => (
                        <FaqItem key={i} q={faq.q} a={faq.a} />
                    ))}
                </div>

                {/* CTA */}
                <div
                    style={{
                        textAlign: "center",
                        marginTop: 64,
                        padding: "40px 32px",
                        background: C.raised,
                        borderRadius: 16,
                        border: `1px solid ${C.border}`,
                    }}
                >
                    <h2
                        style={{
                            fontFamily: C.serif,
                            fontSize: 24,
                            fontWeight: 400,
                            color: C.text,
                            margin: "0 0 8px",
                        }}
                    >
                        Still have questions?
                    </h2>
                    <p style={{ fontSize: 14, color: C.textSec, margin: "0 0 24px" }}>Reach out to our team and we'll get back to you within a day.</p>
                    <a
                        href="mailto:hello@mitable.ai"
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "10px 24px",
                            borderRadius: 10,
                            fontSize: 14,
                            fontWeight: 500,
                            color: "#1A1916",
                            background: C.text,
                            textDecoration: "none",
                            transition: "opacity 0.15s",
                        }}
                    >
                        Get in touch
                    </a>
                </div>
            </main>

            <LandingFooter />
        </div>
    );
}
