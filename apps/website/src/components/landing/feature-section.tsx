"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Image from "next/image";
import { MacWindow } from "./mockups/mac-window";

const C = {
    text: "var(--l-text, #ECE8E0)",
    textSec: "var(--l-text-secondary, #A09A8E)",
    accent: "var(--l-accent, #82C0CC)",
    serif: 'var(--font-newsreader, "Newsreader"), Georgia, serif',
    sans: 'var(--font-dm-sans, "DM Sans"), system-ui, sans-serif',
};

interface FeatureSectionProps {
    title: string;
    description: string;
    linkText: string;
    linkHref?: string;
    reverse?: boolean;
    screenshot?: string;
    screenshotAlt?: string;
    mockup?: ReactNode;
    /** Render mockup without MacWindow wrapper */
    rawMockup?: boolean;
}

export const FeatureSection = ({
    title,
    description,
    linkText,
    linkHref = "#",
    reverse = false,
    screenshot,
    screenshotAlt = "Feature screenshot",
    mockup,
    rawMockup = false,
}: FeatureSectionProps) => {
    const ref = useRef<HTMLElement>(null);

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
            { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    const textBlock = (
        <div style={{ fontFamily: C.sans }}>
            <h2
                style={{
                    fontFamily: C.serif,
                    fontSize: 34,
                    fontWeight: 400,
                    lineHeight: 1.22,
                    marginBottom: 14,
                    letterSpacing: "-0.01em",
                    color: C.text,
                    margin: "0 0 14px 0",
                }}
            >
                {title}
            </h2>
            <p
                style={{
                    fontSize: 15,
                    color: C.textSec,
                    lineHeight: 1.7,
                    marginBottom: 18,
                    maxWidth: 440,
                    margin: "0 0 18px 0",
                }}
            >
                {description}
            </p>
            <a
                href={linkHref}
                style={{
                    color: C.accent,
                    textDecoration: "none",
                    fontSize: 14,
                    fontWeight: 500,
                    transition: "opacity 0.2s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.75"; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
            >
                {linkText}
            </a>
        </div>
    );

    const visualBlock = (
        <div style={{ overflow: "visible" }}>
            {screenshot ? (
                <div
                    style={{
                        background: "rgba(130, 192, 204, 0.03)",
                        border: "1px solid rgba(130, 192, 204, 0.08)",
                        borderRadius: 16,
                        padding: 14,
                        transition: "border-color 0.3s",
                    }}
                >
                    <Image
                        src={screenshot}
                        alt={screenshotAlt}
                        width={1200}
                        height={750}
                        style={{
                            width: "100%",
                            height: "auto",
                            borderRadius: 10,
                            display: "block",
                            aspectRatio: "16 / 10",
                            objectFit: "cover",
                            objectPosition: "top left",
                        }}
                    />
                </div>
            ) : mockup ? (
                rawMockup ? mockup : <MacWindow>{mockup}</MacWindow>
            ) : null}
        </div>
    );

    return (
        <section
            ref={ref}
            className="l-feature-section"
            style={{
                padding: "100px 48px",
                maxWidth: 1240,
                margin: "0 auto",
                display: "grid",
                gridTemplateColumns: reverse ? "3fr 2fr" : "2fr 3fr",
                gap: 64,
                alignItems: "center",
                opacity: 0,
                transform: "translateY(28px)",
                transition: "opacity 0.7s ease, transform 0.7s ease",
            }}
        >
            {reverse ? (
                <>
                    {visualBlock}
                    {textBlock}
                </>
            ) : (
                <>
                    {textBlock}
                    {visualBlock}
                </>
            )}
        </section>
    );
};
