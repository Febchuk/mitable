"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { LandingFooter } from "@/components/landing";
import { LandingNav } from "@/components/landing/landing-nav";
import { type OsPlatform, useLatestVersion } from "@/hooks/use-os-detection";

const C = {
    bg: "var(--l-bg, #1A1916)",
    raised: "var(--l-bg-raised, #211F1B)",
    overlay: "var(--l-bg-overlay, #2A2824)",
    text: "var(--l-text, #ECE8E0)",
    textSec: "var(--l-text-secondary, #A09A8E)",
    textTer: "var(--l-text-tertiary, #6B665C)",
    accent: "var(--l-accent, #82C0CC)",
    green: "#3A9B6B",
    border: "var(--l-border, #33312B)",
    serif: 'var(--font-newsreader, "Newsreader"), Georgia, serif',
    sans: 'var(--font-dm-sans, "DM Sans"), system-ui, sans-serif',
};

const MitableLogo = () => (
    <svg width="36" height="36" viewBox="0 0 91 102" fill="currentColor">
        <path d="M2 20H13.5C20.6797 20 26.5 25.8203 26.5 33V71C26.5 78.1797 20.6797 84 13.5 84C6.3203 84 0.5 78.1797 0.5 71V21.5L0.507812 21.3467C0.58461 20.5903 1.22334 20 2 20Z" />
        <rect x="33.5" y="2.5" width="25" height="99" rx="12.5" />
        <rect x="65.5" y="20" width="26" height="64" rx="13" />
    </svg>
);

const CheckCircle = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill={C.green} />
        <path d="M8 12.5l2.5 2.5L16 9.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const StepNumber = ({ n }: { n: number }) => (
    <div
        style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: C.accent,
            color: "#1A1916",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 600,
            fontFamily: C.sans,
            flexShrink: 0,
        }}
    >
        {n}
    </div>
);

const StepVisual = ({ children }: { children: React.ReactNode }) => (
    <div
        style={{
            width: "100%",
            aspectRatio: "4 / 3",
            background: C.raised,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
        }}
    >
        {children}
    </div>
);

/* Illustration: Downloads folder with .dmg */
const DownloadsFolderIllustration = () => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <div
            style={{
                width: 100,
                height: 72,
                background: "rgba(var(--l-accent-rgb, 130,192,204), 0.12)",
                border: "1px solid rgba(var(--l-accent-rgb, 130,192,204), 0.2)",
                borderRadius: 10,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
            }}
        >
            <div
                style={{
                    position: "absolute",
                    top: -10,
                    left: 8,
                    width: 36,
                    height: 14,
                    background: "rgba(var(--l-accent-rgb, 130,192,204), 0.18)",
                    borderRadius: "6px 6px 0 0",
                    border: "1px solid rgba(var(--l-accent-rgb, 130,192,204), 0.2)",
                    borderBottom: "none",
                }}
            />
            <div
                style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: "rgba(var(--l-accent-rgb, 130,192,204), 0.12)",
                    border: "1px solid rgba(var(--l-accent-rgb, 130,192,204), 0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: C.accent,
                }}
            >
                <svg width="22" height="22" viewBox="0 0 91 102" fill="currentColor">
                    <path d="M2 20H13.5C20.6797 20 26.5 25.8203 26.5 33V71C26.5 78.1797 20.6797 84 13.5 84C6.3203 84 0.5 78.1797 0.5 71V21.5L0.507812 21.3467C0.58461 20.5903 1.22334 20 2 20Z" />
                    <rect x="33.5" y="2.5" width="25" height="99" rx="12.5" />
                    <rect x="65.5" y="20" width="26" height="64" rx="13" />
                </svg>
            </div>
        </div>
        <span style={{ fontSize: 10, color: C.textTer, fontFamily: C.sans, textTransform: "uppercase", letterSpacing: "0.06em" }}>Downloads</span>
    </div>
);

/* Illustration: Drag to Applications */
const DragToAppsIllustration = () => (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
            style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: "rgba(var(--l-accent-rgb, 130,192,204), 0.12)",
                border: "1px solid rgba(var(--l-accent-rgb, 130,192,204), 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: C.accent,
            }}
        >
            <MitableLogo />
        </div>
        <svg width="28" height="14" viewBox="0 0 28 14" fill="none" stroke={C.textTer} strokeWidth="1.5" strokeLinecap="round">
            <path d="M1 7h24M19 1l6 6-6 6" />
        </svg>
        <div
            style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: C.overlay,
                border: `1px solid ${C.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="1.5" strokeLinecap="round">
                <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
        </div>
    </div>
);

/* Illustration: Open from Applications list */
const OpenFromAppsIllustration = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, width: "70%" }}>
        <div
            style={{
                padding: "10px 14px",
                background: C.overlay,
                borderRadius: "8px 8px 0 0",
                border: `1px solid ${C.border}`,
                borderBottom: "none",
                fontSize: 11,
                fontWeight: 500,
                color: C.text,
                fontFamily: C.sans,
            }}
        >
            Applications
        </div>
        {[
            { name: "Finder.app", active: false },
            { name: "Mitable.app", active: true },
            { name: "Safari.app", active: false },
        ].map((app) => (
            <div
                key={app.name}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 14px",
                    background: app.active ? "rgba(var(--l-accent-rgb, 130,192,204), 0.12)" : C.raised,
                    border: `1px solid ${app.active ? "rgba(var(--l-accent-rgb, 130,192,204), 0.2)" : C.border}`,
                    borderTop: "none",
                    fontSize: 12,
                    color: app.active ? C.accent : C.textSec,
                    fontFamily: C.sans,
                }}
            >
                <div
                    style={{
                        width: 20,
                        height: 20,
                        borderRadius: 5,
                        background: app.active ? "rgba(var(--l-accent-rgb, 130,192,204), 0.15)" : "rgba(var(--l-ui-rgb, 236,232,224), 0.04)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                    }}
                >
                    {app.active && (
                        <svg width="12" height="12" viewBox="0 0 91 102" fill={C.accent}>
                            <path d="M2 20H13.5C20.6797 20 26.5 25.8203 26.5 33V71C26.5 78.1797 20.6797 84 13.5 84C6.3203 84 0.5 78.1797 0.5 71V21.5L0.507812 21.3467C0.58461 20.5903 1.22334 20 2 20Z" />
                            <rect x="33.5" y="2.5" width="25" height="99" rx="12.5" />
                            <rect x="65.5" y="20" width="26" height="64" rx="13" />
                        </svg>
                    )}
                </div>
                {app.name}
            </div>
        ))}
        <div
            style={{
                padding: "6px 14px",
                background: C.raised,
                borderRadius: "0 0 8px 8px",
                border: `1px solid ${C.border}`,
                borderTop: "none",
            }}
        />
    </div>
);

export const ThanksScreen = () => {
    const searchParams = useSearchParams();
    const downloadTriggered = useRef(false);
    const { version, urls, isLoading } = useLatestVersion();

    const platformParam = (searchParams.get("p") || "mac-arm") as OsPlatform;
    const downloadUrl = urls[platformParam] || urls["mac-arm"] || "";

    useEffect(() => {
        if (isLoading || !downloadUrl || downloadTriggered.current) return;
        downloadTriggered.current = true;
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = "";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }, [isLoading, downloadUrl]);

    return (
        <div className="landing" style={{ minHeight: "100dvh", background: C.bg, fontFamily: C.sans }}>
            <LandingNav />

            <main style={{ padding: "160px 48px 80px", maxWidth: 900, margin: "0 auto" }}>
                {/* Status badge */}
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
                    <div
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "6px 16px",
                            borderRadius: 999,
                            background: "rgba(58, 155, 107, 0.1)",
                            border: "1px solid rgba(58, 155, 107, 0.2)",
                            fontSize: 12,
                            fontWeight: 500,
                            color: C.green,
                        }}
                    >
                        <CheckCircle />
                        DOWNLOAD STARTED
                    </div>
                </div>

                {/* Headline */}
                <div style={{ textAlign: "center", marginBottom: 16 }}>
                    <h1
                        style={{
                            fontFamily: C.serif,
                            fontSize: 40,
                            fontWeight: 400,
                            color: C.text,
                            letterSpacing: "-0.02em",
                            lineHeight: 1.25,
                            margin: 0,
                        }}
                    >
                        Thanks for downloading!
                        <br />
                        Just a few steps left
                    </h1>
                </div>

                <p style={{ textAlign: "center", fontSize: 15, color: C.textSec, lineHeight: 1.6, margin: "0 auto 56px", maxWidth: 480 }}>
                    Your download will begin automatically. If it didn&apos;t start,{" "}
                    {downloadUrl ? (
                        <a href={downloadUrl} style={{ color: C.accent, textDecoration: "underline", textUnderlineOffset: 3 }}>
                            download Mitable manually
                        </a>
                    ) : (
                        <a href="/download" style={{ color: C.accent, textDecoration: "underline", textUnderlineOffset: 3 }}>
                            try again
                        </a>
                    )}
                    .
                </p>

                {/* Steps */}
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr",
                        gap: 24,
                        marginBottom: 64,
                    }}
                >
                    {/* Step 1 */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
                        <StepNumber n={1} />
                        <StepVisual>
                            <DownloadsFolderIllustration />
                        </StepVisual>
                        <p style={{ fontSize: 14, color: C.textSec, lineHeight: 1.55, textAlign: "center", margin: 0 }}>
                            Open <strong style={{ color: C.text, fontWeight: 500 }}>Mitable.dmg</strong> from your{" "}
                            <strong style={{ color: C.text, fontWeight: 500 }}>Downloads</strong> folder
                        </p>
                    </div>

                    {/* Step 2 */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
                        <StepNumber n={2} />
                        <StepVisual>
                            <DragToAppsIllustration />
                        </StepVisual>
                        <p style={{ fontSize: 14, color: C.textSec, lineHeight: 1.55, textAlign: "center", margin: 0 }}>
                            Drag the <strong style={{ color: C.text, fontWeight: 500 }}>Mitable</strong> icon into your{" "}
                            <strong style={{ color: C.text, fontWeight: 500 }}>Applications</strong> folder
                        </p>
                    </div>

                    {/* Step 3 */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
                        <StepNumber n={3} />
                        <StepVisual>
                            <OpenFromAppsIllustration />
                        </StepVisual>
                        <p style={{ fontSize: 14, color: C.textSec, lineHeight: 1.55, textAlign: "center", margin: 0 }}>
                            Open the <strong style={{ color: C.text, fontWeight: 500 }}>Mitable</strong> app from your{" "}
                            <strong style={{ color: C.text, fontWeight: 500 }}>Applications</strong> folder
                        </p>
                    </div>
                </div>

                {/* Version */}
                {version && <p style={{ textAlign: "center", fontSize: 12, color: C.textTer }}>Version {version}</p>}
            </main>

            <LandingFooter />
        </div>
    );
};
