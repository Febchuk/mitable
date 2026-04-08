"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useOsDetection } from "@/hooks/use-os-detection";

const C = {
    text: "var(--l-text, #ECE8E0)",
    textSec: "var(--l-text-secondary, #A09A8E)",
    accent: "var(--l-accent, #82C0CC)",
    bg: "var(--l-bg, #1A1916)",
    serif: 'var(--font-newsreader, "Newsreader"), Georgia, serif',
    sans: 'var(--font-dm-sans, "DM Sans"), system-ui, sans-serif',
};

export const HeroSection = () => {
    const heroRef = useRef<HTMLElement>(null);
    const os = useOsDetection();

    useEffect(() => {
        const els = heroRef.current?.querySelectorAll(".hero-reveal");
        if (!els) return;

        els.forEach((el, i) => {
            const htmlEl = el as HTMLElement;
            setTimeout(
                () => {
                    htmlEl.style.opacity = "1";
                    htmlEl.style.transform = "translateY(0)";
                },
                100 + i * 120,
            );
        });
    }, []);

    return (
        <section
            ref={heroRef}
            className="l-hero-section"
            style={{
                fontFamily: C.sans,
                padding: "200px 48px 60px",
                maxWidth: 1100,
                margin: "0 auto",
                textAlign: "center",
            }}
        >
            <h1
                className="hero-reveal"
                style={{
                    fontFamily: C.serif,
                    fontSize: 48,
                    fontWeight: 400,
                    lineHeight: 1.22,
                    color: C.text,
                    letterSpacing: "-0.02em",
                    margin: "0 0 22px 0",
                    opacity: 0,
                    transform: "translateY(28px)",
                    transition: "opacity 0.7s ease, transform 0.7s ease",
                }}
            >
                Is your team working on what <strong style={{ fontWeight: 600 }}>matters</strong>?
                <br />
                <em style={{ fontStyle: "italic", color: C.accent }}>
                    {" "}
                    Now you'll know.
                </em>
            </h1>
            <p
                className="hero-reveal"
                style={{
                    fontSize: 17,
                    color: C.textSec,
                    lineHeight: 1.65,
                    margin: "0 auto 44px",
                    maxWidth: 560,
                    opacity: 0,
                    transform: "translateY(28px)",
                    transition: "opacity 0.7s ease, transform 0.7s ease",
                    transitionDelay: "0.08s",
                }}
            >
                Mitable measures what gets done against your goals, in real time.
            </p>
            <a
                href="/download"
                className="hero-reveal hero-download-cta"
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    background: C.text,
                    color: C.bg,
                    padding: "14px 28px",
                    borderRadius: 10,
                    textDecoration: "none",
                    fontWeight: 500,
                    fontSize: 15,
                    transition: "opacity 0.2s, all 0.7s ease",
                    opacity: 0,
                    transform: "translateY(28px)",
                    transitionDelay: "0.16s",
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = "0.85";
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = "1";
                }}
            >
                {os.label}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M8 3v10M8 13l-3-3M8 13l3-3" />
                </svg>
            </a>
            <Link
                href="/login"
                className="hero-reveal hero-get-started-cta"
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    background: C.text,
                    color: C.bg,
                    padding: "14px 28px",
                    borderRadius: 10,
                    textDecoration: "none",
                    fontWeight: 500,
                    fontSize: 15,
                    transition: "opacity 0.2s, all 0.7s ease",
                    opacity: 0,
                    transform: "translateY(28px)",
                    transitionDelay: "0.16s",
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = "0.85";
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = "1";
                }}
            >
                Get Started
            </Link>
        </section>
    );
};
