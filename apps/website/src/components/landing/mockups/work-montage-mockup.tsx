"use client";

import { type CSSProperties, useEffect, useState } from "react";
import { MitableLogoMinimal } from "@/components/foundations/logo/mitable-logo";
import { type MockupColors, type MockupVariant, getMockupColors } from "./colors";
import { MacWindow } from "./mac-window";

const SCENES = [{ id: "slack" }, { id: "chatgpt" }, { id: "terminal" }, { id: "docs" }] as const;

const SCENE_DURATION = 4500;
const FADE_DURATION = 600;

/* ─── Scene 1: Slack — customer channel (SE / FDE work) ─── */
const SlackScene = ({ charCount, C }: { charCount: number; C: MockupColors }) => {
    const isLight = C.bg === "#F5F1ED";
    const channels = ["# general", "# acme-corp", "# customer-updates", "# team-internal"];
    const messages = [
        { user: "SK", name: "Sarah Kim", time: "2:14 PM", text: "Any updates on the SSO integration for Acme?" },
        { user: "TB", name: "Tunde Bakare", time: "2:18 PM", text: "Just finished configuring their IdP — tested all auth flows and they\u2019re passing \u2713" },
        { user: "JL", name: "James Lee", time: "2:19 PM", text: "Amazing, they\u2019ll be thrilled. Can you send handoff notes?" },
    ];
    const composing = "Sending the handoff doc with the config details now".slice(0, charCount);

    const slackSidebar = isLight ? "#F0EAF4" : "#1D1520";
    const slackSidebarBorder = isLight ? "rgba(74,21,75,0.08)" : "rgba(255,255,255,0.06)";
    const slackTitle = isLight ? "#4A154B" : "#E0D4F5";
    const slackActiveText = isLight ? "#3B1040" : "#fff";
    const slackInactiveText = isLight ? "rgba(74,21,75,0.5)" : "rgba(255,255,255,0.5)";
    const slackActiveBg = isLight ? "rgba(74,21,75,0.1)" : "rgba(255,255,255,0.08)";

    return (
        <div style={{ display: "flex", height: "100%", fontFamily: C.sans }}>
            <div style={{ width: 150, background: slackSidebar, borderRight: `1px solid ${slackSidebarBorder}`, padding: "12px 0", flexShrink: 0 }}>
                <div style={{ padding: "0 12px 10px", fontSize: 13, fontWeight: 600, color: slackTitle }}>Workspace</div>
                {channels.map((ch, i) => (
                    <div
                        key={ch}
                        style={{
                            padding: "5px 12px",
                            fontSize: 12,
                            color: i === 1 ? slackActiveText : slackInactiveText,
                            background: i === 1 ? slackActiveBg : "transparent",
                            borderRadius: i === 1 ? 4 : 0,
                            margin: i === 1 ? "0 6px" : 0,
                        }}
                    >
                        {ch}
                    </div>
                ))}
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.bg }}>
                <div style={{ padding: "10px 16px", borderBottom: `1px solid rgba(${C.uiRgb}, 0.06)`, fontSize: 13, fontWeight: 600, color: C.text }}>
                    # acme-corp
                </div>
                <div style={{ flex: 1, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
                    {messages.map((m) => (
                        <div key={m.time} style={{ display: "flex", gap: 10 }}>
                            <div
                                style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: 6,
                                    background: `rgba(${C.uiRgb}, 0.08)`,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 10,
                                    fontWeight: 600,
                                    color: C.textSec,
                                    flexShrink: 0,
                                }}
                            >
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
                <div style={{ padding: "10px 16px", borderTop: `1px solid rgba(${C.uiRgb}, 0.06)` }}>
                    <div
                        style={{
                            background: `rgba(${C.uiRgb}, 0.04)`,
                            border: `1px solid rgba(${C.uiRgb}, 0.08)`,
                            borderRadius: 8,
                            padding: "10px 12px",
                            fontSize: 12,
                            color: C.text,
                            minHeight: 18,
                        }}
                    >
                        {composing}
                        <span
                            style={{
                                display: "inline-block",
                                width: 1,
                                height: 14,
                                background: C.accent,
                                marginLeft: 1,
                                verticalAlign: "text-bottom",
                                animation: "montage-blink 1s step-end infinite",
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ─── Scene 2: ChatGPT — Excel formula query (ops / sales work) ─── */
const ChatGPTScene = ({ charCount, C }: { charCount: number; C: MockupColors }) => {
    const fullQuery = "give me an excel formula to do some analysis on the forecasting numbers";
    const query = fullQuery.slice(0, charCount);
    const showResponse = charCount >= 55;
    const gptGreen = "#10A37F";

    return (
        <div style={{ fontFamily: C.sans, background: C.bg, height: "100%", display: "flex", flexDirection: "column" }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 14px",
                    background: C.raised,
                    borderBottom: `1px solid rgba(${C.uiRgb}, 0.06)`,
                }}
            >
                <div style={{ display: "flex", gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textFaint} strokeWidth="2">
                        <path d="M15 18l-6-6 6-6" />
                    </svg>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textFaint} strokeWidth="2">
                        <path d="M9 18l6-6-6-6" />
                    </svg>
                </div>
                <div style={{ flex: 1, background: `rgba(${C.uiRgb}, 0.04)`, borderRadius: 6, padding: "5px 10px", fontSize: 11, color: C.textTer }}>
                    chatgpt.com
                </div>
            </div>

            <div style={{ flex: 1, padding: "16px 24px 12px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                {!showResponse ? (
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
                            <div
                                style={{
                                    width: 24,
                                    height: 24,
                                    borderRadius: 999,
                                    background: gptGreen,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                }}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                                </svg>
                            </div>
                            <span style={{ fontSize: 18, fontWeight: 600, color: C.text }}>ChatGPT</span>
                        </div>
                    </div>
                ) : (
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
                        <div
                            style={{
                                alignSelf: "flex-end",
                                maxWidth: "82%",
                                background: `rgba(${C.uiRgb}, 0.06)`,
                                borderRadius: 14,
                                padding: "10px 14px",
                                fontSize: 12,
                                color: C.text,
                                lineHeight: 1.5,
                            }}
                        >
                            {fullQuery}
                        </div>
                        <div style={{ display: "flex", gap: 10, maxWidth: "88%" }}>
                            <div
                                style={{
                                    width: 22,
                                    height: 22,
                                    borderRadius: 999,
                                    background: gptGreen,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                    marginTop: 2,
                                }}
                            >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="3" />
                                </svg>
                            </div>
                            <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.65 }}>
                                Try this:{" "}
                                <code
                                    style={{
                                        background: `rgba(${C.uiRgb}, 0.06)`,
                                        padding: "2px 6px",
                                        borderRadius: 4,
                                        fontSize: 11,
                                        fontFamily: C.mono,
                                    }}
                                >
                                    =FORECAST.ETS(target, values, timeline)
                                </code>
                                <br />
                                It uses exponential smoothing to project values from your historical data.
                            </div>
                        </div>
                    </div>
                )}

                <div style={{ marginTop: 12 }}>
                    <div
                        style={{
                            background: `rgba(${C.uiRgb}, 0.04)`,
                            border: `1px solid rgba(${C.uiRgb}, 0.08)`,
                            borderRadius: 12,
                            padding: "12px 14px",
                            fontSize: 13,
                            color: showResponse ? C.textTer : C.text,
                            minHeight: 18,
                        }}
                    >
                        {showResponse ? (
                            "Ask a follow-up\u2026"
                        ) : (
                            <>
                                {query}
                                <span
                                    style={{
                                        display: "inline-block",
                                        width: 1,
                                        height: 14,
                                        background: C.accent,
                                        marginLeft: 1,
                                        verticalAlign: "text-bottom",
                                        animation: "montage-blink 1s step-end infinite",
                                    }}
                                />
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ─── Scene 3: Terminal — Claude Code startup (eng work) ─── */
const TerminalScene = ({ charCount, lineCount, C }: { charCount: number; lineCount: number; C: MockupColors }) => {
    const isLight = C.bg === "#F5F1ED";
    const termBg = isLight ? "#F8F5F2" : "#0D0D0D";
    const claudeOrange = "#CC785C";
    const boxBorder = isLight ? "rgba(28,43,51,0.15)" : "rgba(255,255,255,0.1)";

    const typedCmd = "claude".slice(0, charCount);
    const showBox = charCount >= 6 && lineCount >= 2;
    const showTips = lineCount >= 3;
    const showCwd = lineCount >= 4;
    const showPrompt = lineCount >= 5;

    return (
        <div
            style={{
                fontFamily: C.mono,
                fontSize: 12,
                lineHeight: 1.7,
                background: termBg,
                color: C.textSec,
                padding: "14px 16px",
                height: "100%",
                overflowY: "auto",
                boxSizing: "border-box",
            }}
        >
            <div style={{ whiteSpace: "pre" }}>
                <span style={{ color: C.accent }}>~/project $&nbsp;</span>
                {typedCmd}
                {charCount < 6 && (
                    <span
                        style={{
                            display: "inline-block",
                            width: 7,
                            height: 14,
                            background: C.textSec,
                            marginLeft: 2,
                            verticalAlign: "text-bottom",
                            animation: "montage-blink 1s step-end infinite",
                        }}
                    />
                )}
            </div>

            {showBox && (
                <div
                    style={{
                        border: `1px solid ${boxBorder}`,
                        borderRadius: 8,
                        padding: "10px 14px",
                        margin: "10px 0 0",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: claudeOrange, fontSize: 16, lineHeight: 1 }}>{"\u2733"}</span>
                        <span style={{ color: C.text, fontWeight: 600, fontSize: 13 }}>Welcome to Claude Code!</span>
                        <span style={{ color: C.textFaint, fontSize: 10 }}>v1.0.14</span>
                    </div>
                    {showTips && (
                        <div style={{ fontSize: 11, color: C.textTer, marginTop: 8 }}>
                            <span style={{ color: C.accent }}>/help</span> for help &nbsp;\u00B7&nbsp;{" "}
                            <span style={{ color: C.accent }}>/status</span> for setup
                        </div>
                    )}
                </div>
            )}

            {showCwd && (
                <div style={{ fontSize: 11, color: C.textTer, marginTop: 8 }}>
                    cwd: <span style={{ color: C.textSec }}>~/project</span>
                </div>
            )}

            {showPrompt && (
                <div style={{ marginTop: 8, whiteSpace: "pre" }}>
                    <span style={{ color: claudeOrange, fontSize: 14 }}>{"\u276F"}</span>
                    <span
                        style={{
                            display: "inline-block",
                            width: 7,
                            height: 14,
                            background: C.textSec,
                            marginLeft: 6,
                            verticalAlign: "text-bottom",
                            animation: "montage-blink 1s step-end infinite",
                        }}
                    />
                </div>
            )}
        </div>
    );
};

/* ─── Scene 4: Document Editor — Product strategy (product work) ─── */
const DocsScene = ({ charCount, C }: { charCount: number; C: MockupColors }) => {
    const bodyText =
        "Smart Alerts will enable teams to set threshold-based notifications on pipeline coverage, forecast variance, and deal velocity. By surfacing anomalies early we cut the gap between signal and action. Phase 1 targets sales leads and CSMs with configurable triggers across...".slice(
            0,
            charCount,
        );
    const toolbarItems = ["B", "I", "U", "S"];

    return (
        <div style={{ fontFamily: C.sans, background: C.bg, height: "100%", display: "flex", flexDirection: "column" }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    padding: "6px 14px",
                    borderBottom: `1px solid rgba(${C.uiRgb}, 0.06)`,
                    background: C.raised,
                }}
            >
                {toolbarItems.map((t) => (
                    <div
                        key={t}
                        style={{
                            width: 26,
                            height: 26,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            fontWeight: t === "B" ? 700 : 400,
                            fontStyle: t === "I" ? "italic" : "normal",
                            textDecoration: t === "U" ? "underline" : t === "S" ? "line-through" : "none",
                            color: C.textSec,
                            borderRadius: 4,
                        }}
                    >
                        {t}
                    </div>
                ))}
                <div style={{ width: 1, height: 16, background: `rgba(${C.uiRgb}, 0.08)`, margin: "0 6px" }} />
                <div style={{ fontSize: 11, color: C.textTer, padding: "2px 8px", borderRadius: 4, border: `1px solid rgba(${C.uiRgb}, 0.08)` }}>
                    Normal text
                </div>
            </div>
            <div style={{ flex: 1, padding: "24px 32px", overflowY: "auto" }}>
                <div style={{ fontSize: 20, fontWeight: 600, color: C.text, marginBottom: 16 }}>Q3 Product Strategy — Smart Alerts</div>
                <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.75 }}>
                    {bodyText}
                    <span
                        style={{
                            display: "inline-block",
                            width: 1,
                            height: 15,
                            background: C.text,
                            marginLeft: 1,
                            verticalAlign: "text-bottom",
                            animation: "montage-blink 1s step-end infinite",
                        }}
                    />
                </div>
            </div>
        </div>
    );
};

/* ─── Mitable recording pill (vertical, right side) ─── */
const RecordingPill = ({ C }: { C: MockupColors }) => {
    const [hovered, setHovered] = useState<string | null>(null);
    const isLight = C.bg === "#F5F1ED";

    const pillBg = isLight ? "rgba(245,241,237,0.96)" : "rgba(26,26,26,0.96)";
    const pillShadow = isLight ? "0 20px 40px rgba(0,0,0,0.1)" : "0 20px 40px rgba(0,0,0,0.35)";
    const btnHoverBg = isLight ? "rgba(28,43,51,0.08)" : "rgba(255,255,255,0.1)";
    const btnColor = isLight ? "rgba(28,43,51,0.74)" : "rgba(255,255,255,0.74)";
    const dividerColor = isLight ? "rgba(28,43,51,0.1)" : "rgba(255,255,255,0.1)";

    const btnStyle = (id: string): CSSProperties => ({
        width: 28,
        height: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 999,
        background: hovered === id ? btnHoverBg : "transparent",
        color: btnColor,
        border: "none",
        cursor: "pointer",
        transition: "background 0.15s ease, color 0.15s ease, transform 0.15s ease",
        transform: hovered === id ? "scale(0.98)" : "scale(1)",
    });

    return (
        <div
            className="recording-pill"
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
                background: pillBg,
                backdropFilter: "blur(16px)",
                boxShadow: pillShadow,
            }}
        >
            <div style={{ ...btnStyle("logo"), position: "relative" }} onMouseEnter={() => setHovered("logo")} onMouseLeave={() => setHovered(null)}>
                <MitableLogoMinimal style={{ width: 14, height: 16, color: C.text }} />
                <span
                    style={{
                        position: "absolute",
                        top: 1,
                        right: 2,
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: C.red,
                        boxShadow: "0 0 0 0 rgba(239,68,68,0.45)",
                        animation: "montage-pulse 1.6s infinite",
                    }}
                />
            </div>
            <div style={{ width: 20, height: 1, background: dividerColor }} />
            <div style={btnStyle("mic")} onMouseEnter={() => setHovered("mic")} onMouseLeave={() => setHovered(null)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="9" y="1" width="6" height="12" rx="3" />
                    <path d="M5 10a7 7 0 0014 0M12 19v4" />
                </svg>
            </div>
            <div style={{ width: 20, height: 1, background: dividerColor }} />
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
export const WorkMontageMockup = ({ variant = "dark" }: { variant?: MockupVariant }) => {
    const C = getMockupColors(variant);
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
                setCharCount((c) => Math.min(c + 1, 51));
            } else if (scene.id === "chatgpt") {
                setCharCount((c) => Math.min(c + 2, 71));
            } else if (scene.id === "terminal") {
                if (frame <= 6) {
                    setCharCount(frame);
                } else if ((frame - 6) % 4 === 0) {
                    setLineCount((c) => Math.min(c + 1, 5));
                }
            } else if (scene.id === "docs") {
                setCharCount((c) => Math.min(c + 1, 270));
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
            case "slack":
                return <SlackScene charCount={charCount} C={C} />;
            case "chatgpt":
                return <ChatGPTScene charCount={charCount} C={C} />;
            case "terminal":
                return <TerminalScene charCount={charCount} lineCount={lineCount} C={C} />;
            case "docs":
                return <DocsScene charCount={charCount} C={C} />;
        }
    };

    return (
        <div className="l-work-montage-wrap" style={{ position: "relative" }}>
            <div style={{ opacity, transition: `opacity ${FADE_DURATION}ms ease` }}>
                <MacWindow variant={variant}>{renderScene()}</MacWindow>
            </div>
            <RecordingPill C={C} />

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
                @media (max-width: 768px) {
                    .recording-pill {
                        right: auto !important;
                        left: 8px !important;
                        top: auto !important;
                        bottom: 44px !important;
                    }
                }
            `}</style>
        </div>
    );
};
