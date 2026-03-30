"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { MitableLogoMinimal } from "@/components/foundations/logo/mitable-logo";
import { MacWindow } from "./mac-window";

const C = {
    bg: "#1A1916",
    raised: "#211F1B",
    overlay: "#2A2824",
    muted: "#33312B",
    accent: "#82C0CC",
    text: "#ECE8E0",
    textSec: "#A09A8E",
    textTer: "#6B665C",
    textFaint: "#4A4640",
    uiRgb: "236,232,224",
    green: "#3A9B6B",
    red: "#EF4444",
    sans: 'var(--font-dm-sans, "DM Sans"), system-ui, sans-serif',
    mono: 'var(--font-jetbrains-mono, "JetBrains Mono"), "Fira Code", monospace',
};

const SCENES = [
    { id: "slack" },
    { id: "perplexity" },
    { id: "terminal" },
    { id: "docs" },
] as const;

const SCENE_DURATION = 4500;
const FADE_DURATION = 600;

/* ─── Scene 1: Slack ─── */
const SlackScene = ({ charCount }: { charCount: number }) => {
    const channels = ["# general", "# eng-standup", "# design", "# random"];
    const messages = [
        { user: "SK", name: "Sarah Kim", time: "10:23 AM", text: "Just shipped the auth refactor — PR is up for review" },
        { user: "JL", name: "James Lee", time: "10:25 AM", text: "Nice! I'll take a look after standup" },
        { user: "MR", name: "Maya Rivera", time: "10:31 AM", text: "Can someone point me to the API docs for the new endpoints?" },
    ];
    const composing = "Looking into it now, should have an update by".slice(0, charCount);

    return (
        <div style={{ display: "flex", height: "100%", fontFamily: C.sans }}>
            {/* Sidebar */}
            <div style={{ width: 150, background: "#1D1520", borderRight: `1px solid rgba(255,255,255,0.06)`, padding: "12px 0", flexShrink: 0 }}>
                <div style={{ padding: "0 12px 10px", fontSize: 13, fontWeight: 600, color: "#E0D4F5" }}>Workspace</div>
                {channels.map((ch, i) => (
                    <div
                        key={ch}
                        style={{
                            padding: "5px 12px",
                            fontSize: 12,
                            color: i === 1 ? "#fff" : "rgba(255,255,255,0.5)",
                            background: i === 1 ? "rgba(255,255,255,0.08)" : "transparent",
                            borderRadius: i === 1 ? 4 : 0,
                            margin: i === 1 ? "0 6px" : 0,
                        }}
                    >
                        {ch}
                    </div>
                ))}
            </div>
            {/* Chat area */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.bg }}>
                <div style={{ padding: "10px 16px", borderBottom: `1px solid rgba(${C.uiRgb}, 0.06)`, fontSize: 13, fontWeight: 600, color: C.text }}>
                    # eng-standup
                </div>
                <div style={{ flex: 1, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
                    {messages.map((m) => (
                        <div key={m.time} style={{ display: "flex", gap: 10 }}>
                            <div style={{ width: 28, height: 28, borderRadius: 6, background: `rgba(${C.uiRgb}, 0.08)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, color: C.textSec, flexShrink: 0 }}>
                                {m.user}
                            </div>
                            <div>
                                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{m.name}</span>
                                    <span style={{ fontSize: 10, color: C.textFaint }}>{m.time}</span>
                                </div>
                                <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.5, marginTop: 2 }}>{m.text}</div>
                            </div>
                        </div>
                    ))}
                </div>
                {/* Compose */}
                <div style={{ padding: "10px 16px", borderTop: `1px solid rgba(${C.uiRgb}, 0.06)` }}>
                    <div style={{ background: `rgba(${C.uiRgb}, 0.04)`, border: `1px solid rgba(${C.uiRgb}, 0.08)`, borderRadius: 8, padding: "10px 12px", fontSize: 12, color: C.text, minHeight: 18 }}>
                        {composing}
                        <span style={{ display: "inline-block", width: 1, height: 14, background: C.accent, marginLeft: 1, verticalAlign: "text-bottom", animation: "montage-blink 1s step-end infinite" }} />
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ─── Scene 2: Perplexity ─── */
const PerplexityScene = ({ charCount }: { charCount: number }) => {
    const query = "best practices for database migration in production".slice(0, charCount);
    const showResults = charCount >= 42;

    return (
        <div style={{ fontFamily: C.sans, background: C.bg, height: "100%", display: "flex", flexDirection: "column" }}>
            {/* Browser chrome */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: C.raised, borderBottom: `1px solid rgba(${C.uiRgb}, 0.06)` }}>
                <div style={{ display: "flex", gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textFaint} strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textFaint} strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                </div>
                <div style={{ flex: 1, background: `rgba(${C.uiRgb}, 0.04)`, borderRadius: 6, padding: "5px 10px", fontSize: 11, color: C.textTer }}>
                    perplexity.ai
                </div>
            </div>
            {/* Search area */}
            <div style={{ flex: 1, padding: "32px 24px 16px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: C.text, marginBottom: 20 }}>Ask anything</div>
                <div style={{ width: "100%", maxWidth: 420, background: `rgba(${C.uiRgb}, 0.04)`, border: `1px solid rgba(${C.uiRgb}, 0.08)`, borderRadius: 10, padding: "12px 14px", fontSize: 13, color: C.text }}>
                    {query}
                    <span style={{ display: "inline-block", width: 1, height: 14, background: C.accent, marginLeft: 1, verticalAlign: "text-bottom", animation: "montage-blink 1s step-end infinite" }} />
                </div>
                {showResults && (
                    <div style={{ width: "100%", maxWidth: 420, marginTop: 16, display: "flex", flexDirection: "column", gap: 10, opacity: showResults ? 1 : 0, transition: "opacity 0.4s" }}>
                        {["Use versioned migrations with rollback support", "Always run migrations in a transaction", "Test against a staging replica first"].map((r, i) => (
                            <div key={i} style={{ background: `rgba(${C.uiRgb}, 0.03)`, border: `1px solid rgba(${C.uiRgb}, 0.06)`, borderRadius: 8, padding: "10px 12px", fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>
                                <span style={{ color: C.accent, marginRight: 6 }}>{i + 1}.</span>{r}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

/* ─── Scene 3: Terminal ─── */
const TerminalScene = ({ lineCount }: { lineCount: number }) => {
    const lines = [
        { prompt: true, text: "git status" },
        { prompt: false, text: "On branch feat/auth-refactor" },
        { prompt: false, text: "Changes staged for commit:" },
        { prompt: false, text: "  modified:   src/auth/middleware.ts", color: C.green },
        { prompt: false, text: "  modified:   src/auth/session.ts", color: C.green },
        { prompt: false, text: "" },
        { prompt: true, text: "npm run build" },
        { prompt: false, text: "> mitable@1.0.0 build" },
        { prompt: false, text: "✓ Compiled successfully in 4.2s", color: C.green },
    ];

    return (
        <div style={{ fontFamily: C.mono, fontSize: 12, lineHeight: 1.7, background: "#0D0D0D", color: C.textSec, padding: "14px 16px", height: "100%", overflowY: "auto", boxSizing: "border-box" }}>
            {lines.slice(0, lineCount).map((l, i) => (
                <div key={i} style={{ color: l.color || C.textSec, whiteSpace: "pre" }}>
                    {l.prompt && <span style={{ color: C.accent }}>~/mitable $&nbsp;</span>}
                    {l.text}
                    {i === lineCount - 1 && l.prompt && (
                        <span style={{ display: "inline-block", width: 7, height: 14, background: C.textSec, marginLeft: 2, verticalAlign: "text-bottom", animation: "montage-blink 1s step-end infinite" }} />
                    )}
                </div>
            ))}
        </div>
    );
};

/* ─── Scene 4: Document Editor (dark mode) ─── */
const DocsScene = ({ charCount }: { charCount: number }) => {
    const bodyText = "The new authentication flow uses short-lived JWTs with refresh token rotation. This ensures that compromised tokens expire quickly while maintaining a seamless user experience. Key changes include...".slice(0, charCount);
    const toolbarItems = ["B", "I", "U", "S"];

    return (
        <div style={{ fontFamily: C.sans, background: C.bg, height: "100%", display: "flex", flexDirection: "column" }}>
            {/* Toolbar */}
            <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "6px 14px", borderBottom: `1px solid rgba(${C.uiRgb}, 0.06)`, background: C.raised }}>
                {toolbarItems.map((t) => (
                    <div key={t} style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: t === "B" ? 700 : 400, fontStyle: t === "I" ? "italic" : "normal", textDecoration: t === "U" ? "underline" : t === "S" ? "line-through" : "none", color: C.textSec, borderRadius: 4 }}>
                        {t}
                    </div>
                ))}
                <div style={{ width: 1, height: 16, background: `rgba(${C.uiRgb}, 0.08)`, margin: "0 6px" }} />
                <div style={{ fontSize: 11, color: C.textTer, padding: "2px 8px", borderRadius: 4, border: `1px solid rgba(${C.uiRgb}, 0.08)` }}>Normal text</div>
            </div>
            {/* Document */}
            <div style={{ flex: 1, padding: "24px 32px", overflowY: "auto" }}>
                <div style={{ fontSize: 20, fontWeight: 600, color: C.text, marginBottom: 16 }}>Auth System Technical Spec</div>
                <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.75 }}>
                    {bodyText}
                    <span style={{ display: "inline-block", width: 1, height: 15, background: C.text, marginLeft: 1, verticalAlign: "text-bottom", animation: "montage-blink 1s step-end infinite" }} />
                </div>
            </div>
        </div>
    );
};

/* ─── Mitable recording pill (vertical, right side) ─── */
const RecordingPill = () => {
    const [hovered, setHovered] = useState<string | null>(null);

    const btnStyle = (id: string): CSSProperties => ({
        width: 28,
        height: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 999,
        background: hovered === id ? "rgba(255,255,255,0.1)" : "transparent",
        color: "rgba(255,255,255,0.74)",
        border: "none",
        cursor: "pointer",
        transition: "background 0.15s ease, color 0.15s ease, transform 0.15s ease",
        transform: hovered === id ? "scale(0.98)" : "scale(1)",
    });

    return (
        <div
            style={{
                position: "absolute",
                right: -24,
                top: 80,
                zIndex: 10,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                padding: 8,
                borderRadius: 999,
                background: "rgba(26,26,26,0.96)",
                backdropFilter: "blur(16px)",
                boxShadow: "0 20px 40px rgba(0,0,0,0.35)",
            }}
        >
            <div style={{ ...btnStyle("logo"), position: "relative" }} onMouseEnter={() => setHovered("logo")} onMouseLeave={() => setHovered(null)}>
                <MitableLogoMinimal style={{ width: 14, height: 16, color: C.text }} />
                <span style={{ position: "absolute", top: 1, right: 2, width: 7, height: 7, borderRadius: "50%", background: C.red, boxShadow: "0 0 0 0 rgba(239,68,68,0.45)", animation: "montage-pulse 1.6s infinite" }} />
            </div>
            <div style={{ width: 20, height: 1, background: "rgba(255,255,255,0.1)" }} />
            <div style={btnStyle("mic")} onMouseEnter={() => setHovered("mic")} onMouseLeave={() => setHovered(null)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="9" y="1" width="6" height="12" rx="3" />
                    <path d="M5 10a7 7 0 0014 0M12 19v4" />
                </svg>
            </div>
            <div style={{ width: 20, height: 1, background: "rgba(255,255,255,0.1)" }} />
            <div style={btnStyle("pause")} onMouseEnter={() => setHovered("pause")} onMouseLeave={() => setHovered(null)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="5" y="3" width="5" height="18" rx="1" />
                    <rect x="14" y="3" width="5" height="18" rx="1" />
                </svg>
            </div>
        </div>
    );
};

/* ─── Main montage component ─── */
export const WorkMontageMockup = () => {
    const [activeScene, setActiveScene] = useState(0);
    const [charCount, setCharCount] = useState(0);
    const [lineCount, setLineCount] = useState(1);
    const [opacity, setOpacity] = useState(1);

    useEffect(() => {
        let frame = 0;
        const interval = setInterval(() => {
            frame++;
            const scene = SCENES[activeScene];

            if (scene.id === "slack") {
                setCharCount((c) => Math.min(c + 1, 44));
            } else if (scene.id === "perplexity") {
                setCharCount((c) => Math.min(c + 1, 50));
            } else if (scene.id === "terminal") {
                if (frame % 4 === 0) setLineCount((c) => Math.min(c + 1, 9));
            } else if (scene.id === "docs") {
                setCharCount((c) => Math.min(c + 1, 190));
            }
        }, 80);

        return () => clearInterval(interval);
    }, [activeScene]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setOpacity(0);
            setTimeout(() => {
                setActiveScene((s) => (s + 1) % SCENES.length);
                setCharCount(0);
                setLineCount(1);
                setTimeout(() => setOpacity(1), 50);
            }, FADE_DURATION);
        }, SCENE_DURATION);

        return () => clearTimeout(timer);
    }, [activeScene]);

    const renderScene = () => {
        switch (SCENES[activeScene].id) {
            case "slack": return <SlackScene charCount={charCount} />;
            case "perplexity": return <PerplexityScene charCount={charCount} />;
            case "terminal": return <TerminalScene lineCount={lineCount} />;
            case "docs": return <DocsScene charCount={charCount} />;
        }
    };

    return (
        <div style={{ position: "relative" }}>
            <div style={{ opacity, transition: `opacity ${FADE_DURATION}ms ease` }}>
                <MacWindow>
                    {renderScene()}
                </MacWindow>
            </div>
            <RecordingPill />

            <style>{`
                @keyframes montage-blink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0; }
                }
                @keyframes montage-pulse {
                    0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.45); }
                    70% { box-shadow: 0 0 0 5px rgba(239,68,68,0); }
                    100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
                }
            `}</style>
        </div>
    );
};
