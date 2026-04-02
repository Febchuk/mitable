"use client";

import { type FormEvent, useState } from "react";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingFooter } from "@/components/landing";

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

export default function ContactPage() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [company, setCompany] = useState("");
    const [message, setMessage] = useState("");

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();

        const subject = encodeURIComponent(`Enterprise Inquiry from ${name}${company ? ` (${company})` : ""}`);

        const bodyParts = [`Name: ${name}`, `Email: ${email}`, company && `Company: ${company}`, "", message].filter(Boolean).join("\n");

        const body = encodeURIComponent(bodyParts);

        window.location.href = `mailto:mikun@mitable.ai?subject=${subject}&body=${body}`;
    };

    return (
        <div className="landing" style={{ minHeight: "100dvh", background: C.bg, fontFamily: C.sans }}>
            <LandingNav />

            <main style={{ padding: "180px 48px 80px", maxWidth: 640, margin: "0 auto" }}>
                <a
                    href="/"
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 13,
                        color: C.textTer,
                        textDecoration: "none",
                        marginBottom: 40,
                        transition: "color 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--l-text)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--l-text-tertiary, #6B665C)"; }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="19" y1="12" x2="5" y2="12" />
                        <polyline points="12 19 5 12 12 5" />
                    </svg>
                    Back to home
                </a>

                <div style={{ textAlign: "center", marginBottom: 48 }}>
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
                        Contact Sales
                    </h1>
                    <p style={{ fontSize: 16, color: C.textSec, lineHeight: 1.6, margin: 0 }}>
                        Tell us about your team and we&apos;ll get back to you.
                    </p>
                </div>

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <div>
                        <label style={{ display: "block", fontSize: 10, color: C.textTer, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 8 }}>Name *</label>
                        <input
                            required
                            placeholder="Your full name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            style={inputStyle}
                        />
                    </div>

                    <div>
                        <label style={{ display: "block", fontSize: 10, color: C.textTer, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 8 }}>Email *</label>
                        <input
                            required
                            type="email"
                            placeholder="you@company.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            style={inputStyle}
                        />
                    </div>

                    <div>
                        <label style={{ display: "block", fontSize: 10, color: C.textTer, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 8 }}>Company</label>
                        <input
                            placeholder="Company name (optional)"
                            value={company}
                            onChange={(e) => setCompany(e.target.value)}
                            style={inputStyle}
                        />
                    </div>

                    <div>
                        <label style={{ display: "block", fontSize: 10, color: C.textTer, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 8 }}>Message *</label>
                        <textarea
                            required
                            rows={5}
                            placeholder="How can we help?"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            style={{ ...inputStyle, resize: "vertical", minHeight: 120 }}
                        />
                    </div>

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
                        Send Message
                    </button>
                </form>
            </main>

            <LandingFooter />
        </div>
    );
}
