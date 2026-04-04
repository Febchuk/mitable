"use client";

import { useEffect, useRef } from "react";
import { useOsDetection } from "@/hooks/use-os-detection";

const C = {
    text: "var(--l-text, #ECE8E0)",
    textSec: "var(--l-text-secondary, #A09A8E)",
    bg: "var(--l-bg, #1A1916)",
    serif: 'var(--font-newsreader, "Newsreader"), Georgia, serif',
    sans: 'var(--font-dm-sans, "DM Sans"), system-ui, sans-serif',
};

export const ClosingCtaSection = () => {
    const ref = useRef<HTMLElement>(null);
    const os = useOsDetection();

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            ([e]) => {
                if (e.isIntersecting) {
                    el.style.opacity = "1";
                    el.style.transform = "translateY(0)";
                }
            },
            { threshold: 0.15 },
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    return (
        <section
            ref={ref}
            className="l-closing-cta"
            style={{
                padding: "140px 48px",
                textAlign: "center",
                fontFamily: C.sans,
                opacity: 0,
                transform: "translateY(28px)",
                transition: "opacity 0.7s ease, transform 0.7s ease",
            }}
        >
            <h2
                style={{
                    fontFamily: C.serif,
                    fontSize: 52,
                    fontWeight: 400,
                    color: C.text,
                    marginBottom: 20,
                    letterSpacing: "-0.02em",
                    margin: "0 0 20px 0",
                    lineHeight: 1.15,
                }}
            >
                Management is changing.
            </h2>
            <p
                style={{
                    fontFamily: C.serif,
                    fontSize: 18,
                    fontWeight: 400,
                    lineHeight: 1.6,
                    maxWidth: 600,
                    margin: "0 auto 40px",
                    color: C.textSec,
                }}
            >
                The teams that win will be the ones where everyone knows exactly what good looks like and can see whether they&apos;re hitting it.
            </p>
            <a
                href="/download"
                className="closing-download-cta"
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    background: C.text,
                    color: C.bg,
                    padding: "16px 32px",
                    borderRadius: 10,
                    textDecoration: "none",
                    fontWeight: 500,
                    fontSize: 16,
                    fontFamily: C.sans,
                    transition: "opacity 0.2s",
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
        </section>
    );
};
