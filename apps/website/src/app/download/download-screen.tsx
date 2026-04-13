"use client";

import { LandingFooter } from "@/components/landing";
import { LandingNav } from "@/components/landing/landing-nav";
import { type OsPlatform, useLatestVersion, useOsDetection } from "@/hooks/use-os-detection";

const BUILDS: { id: OsPlatform; platform: string; description: string; icon: "apple" | "windows" }[] = [
    { id: "mac-arm", platform: "macOS (Apple Silicon)", description: "For M1, M2, M3, and M4 Macs", icon: "apple" },
    { id: "mac-intel", platform: "macOS (Intel)", description: "For Intel-based Macs", icon: "apple" },
    { id: "windows", platform: "Windows", description: "For Windows 10 and later", icon: "windows" },
];

function hrefForBuild(id: OsPlatform, urls: Record<string, string>): string {
    if (id === "mac-arm" || id === "mac-intel") {
        return `/download/thanks?p=${id}`;
    }
    return urls[id] ?? "/download";
}

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

const AppleIcon = () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
);

const WindowsIcon = () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
        <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
    </svg>
);

const iconMap = { apple: AppleIcon, windows: WindowsIcon };

export const DownloadScreen = () => {
    const os = useOsDetection();
    const { version, urls, isLoading } = useLatestVersion();

    const recommended = BUILDS.find((b) => b.id === os.platform);
    const others = BUILDS.filter((b) => b.id !== os.platform);

    return (
        <div className="landing" style={{ minHeight: "100dvh", background: C.bg, fontFamily: C.sans }}>
            <LandingNav />

            <main style={{ padding: "180px 48px 80px", maxWidth: 860, margin: "0 auto" }}>
                {/* Headline */}
                <div style={{ textAlign: "center", marginBottom: 56 }}>
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
                        Download Mitable
                    </h1>
                    <p style={{ fontSize: 16, color: C.textSec, lineHeight: 1.6, margin: 0 }}>Choose the right version for your platform.</p>
                </div>

                {/* Recommended build */}
                {os.ready && recommended && !isLoading && (
                    <div style={{ marginBottom: 32 }}>
                        <span
                            style={{
                                display: "block",
                                fontSize: 10,
                                color: C.textTer,
                                textTransform: "uppercase",
                                letterSpacing: "0.09em",
                                marginBottom: 12,
                            }}
                        >
                            Recommended for your device
                        </span>
                        <a
                            href={hrefForBuild(recommended.id, urls)}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 20,
                                padding: "24px 28px",
                                background: C.raised,
                                border: "1px solid rgba(130, 192, 204, 0.15)",
                                borderRadius: 14,
                                textDecoration: "none",
                                transition: "border-color 0.2s",
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = "rgba(130, 192, 204, 0.3)";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = "rgba(130, 192, 204, 0.15)";
                            }}
                        >
                            <div style={{ color: C.text, flexShrink: 0 }}>
                                {(() => {
                                    const Icon = iconMap[recommended.icon];
                                    return <Icon />;
                                })()}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 16, fontWeight: 500, color: C.text, marginBottom: 4 }}>{recommended.platform}</div>
                                <div style={{ fontSize: 13, color: C.textSec }}>{recommended.description}</div>
                            </div>
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    background: C.text,
                                    color: C.bg,
                                    padding: "10px 22px",
                                    borderRadius: 10,
                                    fontSize: 14,
                                    fontWeight: 500,
                                    flexShrink: 0,
                                }}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                Download
                            </div>
                        </a>
                    </div>
                )}

                {/* Other platforms */}
                {!isLoading && (
                    <div>
                        <span
                            style={{
                                display: "block",
                                fontSize: 10,
                                color: C.textTer,
                                textTransform: "uppercase",
                                letterSpacing: "0.09em",
                                marginBottom: 12,
                            }}
                        >
                            {os.ready && recommended ? "Other platforms" : "All platforms"}
                        </span>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                            {(os.ready && recommended ? others : BUILDS).map((build) => {
                                const Icon = iconMap[build.icon];
                                return (
                                    <a
                                        key={build.id}
                                        href={hrefForBuild(build.id, urls)}
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: 14,
                                            padding: "22px 24px",
                                            background: C.raised,
                                            border: `1px solid ${C.border}`,
                                            borderRadius: 14,
                                            textDecoration: "none",
                                            transition: "border-color 0.2s",
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.borderColor = "rgba(236, 232, 224, 0.12)";
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.borderColor = "var(--l-border, #33312B)";
                                        }}
                                    >
                                        <div style={{ color: C.textSec }}>
                                            <Icon />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 15, fontWeight: 500, color: C.text, marginBottom: 3 }}>{build.platform}</div>
                                            <div style={{ fontSize: 12, color: C.textTer }}>{build.description}</div>
                                        </div>
                                        <div
                                            style={{
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: 6,
                                                fontSize: 13,
                                                fontWeight: 500,
                                                color: C.accent,
                                                marginTop: "auto",
                                            }}
                                        >
                                            <svg
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                            >
                                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                <polyline points="7 10 12 15 17 10" />
                                                <line x1="12" y1="15" x2="12" y2="3" />
                                            </svg>
                                            Download
                                        </div>
                                    </a>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Version */}
                {version && <p style={{ textAlign: "center", fontSize: 12, color: C.textTer, marginTop: 48 }}>Version {version}</p>}
            </main>

            <LandingFooter />
        </div>
    );
};
