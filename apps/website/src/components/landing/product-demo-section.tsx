"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown, Mic, Pause } from "lucide-react";
import { MitableLogoMinimal } from "@/components/foundations/logo/mitable-logo";
import { MacWindow } from "./mockups/mac-window";
import { getMockupColors, type MockupVariant, type MockupColors } from "./mockups/colors";

type Frame = {
    company: string;
    status: string;
    role: string;
    activeCell: "company" | "status" | "role";
    dropdownOpen?: boolean;
    durationMs: number;
};

/** Row the demo animates — keep in sync with spreadsheet data below */
const DEMO_FOCUS_NAME = "Chiamaka Obi";

const FINAL_SUMMARY =
    "Processed updates for Chiamaka Obi (Google). Transitioned lead status from New Lead to In Progress and identified role as Forward Deployed Engineer.";

const DROPDOWN_OPTIONS = ["New Lead", "In Progress", "Closed Won", "Lost"];

const FRAMES: Frame[] = [
    { company: "", status: "New Lead", role: "", activeCell: "company", durationMs: 600 },
    { company: "G", status: "New Lead", role: "", activeCell: "company", durationMs: 180 },
    { company: "Go", status: "New Lead", role: "", activeCell: "company", durationMs: 180 },
    { company: "Goo", status: "New Lead", role: "", activeCell: "company", durationMs: 180 },
    { company: "Goog", status: "New Lead", role: "", activeCell: "company", durationMs: 180 },
    { company: "Googl", status: "New Lead", role: "", activeCell: "company", durationMs: 180 },
    { company: "Google", status: "New Lead", role: "", activeCell: "company", durationMs: 700 },
    { company: "Google", status: "New Lead", role: "", activeCell: "status", dropdownOpen: true, durationMs: 900 },
    { company: "Google", status: "In Progress", role: "", activeCell: "status", durationMs: 900 },
    { company: "Google", status: "In Progress", role: "F", activeCell: "role", durationMs: 280 },
    { company: "Google", status: "In Progress", role: "FD", activeCell: "role", durationMs: 280 },
    { company: "Google", status: "In Progress", role: "FDE", activeCell: "role", durationMs: 5000 },
];

const COL = { name: 100, company: 75, status: 100, role: 85 };

const cursorMap: Record<Frame["activeCell"], { left: number; top: number }> = {
    company: { left: COL.name + COL.company / 2, top: 128 },
    status: { left: COL.name + COL.company + COL.status / 2, top: 128 },
    role: { left: COL.name + COL.company + COL.status + COL.role / 2, top: 128 },
};

function DemoWatchingPill({ C }: { C: MockupColors }) {
    const [hovered, setHovered] = useState<string | null>(null);
    const isLight = C.bg === "#F5F1ED";

    const pillBg = isLight ? "rgba(245,241,237,0.96)" : "rgba(26,26,26,0.96)";
    const pillShadow = isLight ? "0 20px 40px rgba(0,0,0,0.1)" : "0 20px 40px rgba(0,0,0,0.35)";
    const btnHoverBg = isLight ? "rgba(28,43,51,0.08)" : "rgba(255,255,255,0.1)";
    const btnColor = isLight ? "rgba(28,43,51,0.74)" : "rgba(255,255,255,0.74)";
    const dividerColor = isLight ? "rgba(28,43,51,0.1)" : "rgba(255,255,255,0.1)";

    const buttonStyle = (id: string): CSSProperties => ({
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
            style={{
                position: "absolute",
                right: -24,
                top: 80,
                zIndex: 2,
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
            <button
                style={{ ...buttonStyle("logo"), position: "relative" }}
                onMouseEnter={() => setHovered("logo")}
                onMouseLeave={() => setHovered(null)}
                aria-label="Mitable recording indicator"
            >
                <MitableLogoMinimal style={{ width: 14, height: 16, color: C.text }} />
                <span
                    style={{
                        position: "absolute",
                        top: 1,
                        right: 2,
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: "#EF4444",
                        boxShadow: "0 0 0 0 rgba(239,68,68,0.45)",
                        animation: "demo-pulse 1.6s infinite",
                    }}
                />
            </button>
            <div style={{ width: 20, height: 1, background: dividerColor }} />
            <button
                style={buttonStyle("mic")}
                onMouseEnter={() => setHovered("mic")}
                onMouseLeave={() => setHovered(null)}
                aria-label="Microphone"
            >
                <Mic size={13} />
            </button>
            <div style={{ width: 20, height: 1, background: dividerColor }} />
            <button
                style={buttonStyle("pause")}
                onMouseEnter={() => setHovered("pause")}
                onMouseLeave={() => setHovered(null)}
                aria-label="Pause"
            >
                <Pause size={13} />
            </button>
        </div>
    );
}

function SpreadsheetCell({
    children,
    width,
    active = false,
    align = "left",
    color,
    C,
}: {
    children: ReactNode;
    width: number;
    active?: boolean;
    align?: "left" | "center";
    color?: string;
    C: MockupColors;
}) {
    const [hovered, setHovered] = useState(false);
    const isLight = C.bg === "#F5F1ED";
    const hoverBg = isLight ? "rgba(28,43,51,0.03)" : "rgba(255,255,255,0.03)";

    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                width,
                minWidth: width,
                padding: "10px 12px",
                fontSize: 12,
                color: color ?? C.textSec,
                borderRight: `1px solid ${C.border}`,
                borderBottom: `1px solid ${C.border}`,
                background: active
                    ? `rgba(${C.accentRgb}, 0.08)`
                    : hovered
                      ? hoverBg
                      : "transparent",
                boxShadow: active ? `inset 0 0 0 1px rgba(${C.accentRgb}, 0.2)` : "none",
                transition: "background 0.15s ease, box-shadow 0.15s ease",
                textAlign: align,
                position: "relative",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                fontFamily: C.sans,
                minHeight: 40,
            }}
        >
            {children}
        </div>
    );
}

function InputSpreadsheet({ frame, C }: { frame: Frame; C: MockupColors }) {
    const cursorPos = cursorMap[frame.activeCell];
    const isLight = C.bg === "#F5F1ED";

    const sheetBg = isLight ? "#F0EBE6" : "#171612";
    const headerBg = isLight ? "#ECE7E2" : "#1D1B17";
    const tabBg = isLight ? "rgba(28,43,51,0.04)" : "rgba(255,255,255,0.04)";
    const gradientBg = isLight
        ? "linear-gradient(180deg, rgba(28,43,51,0.015), transparent 24%)"
        : "linear-gradient(180deg, rgba(255,255,255,0.015), transparent 24%)";
    const dropdownHover = isLight ? "rgba(28,43,51,0.06)" : "rgba(255,255,255,0.06)";

    const rows: [string, string, string, string][] = [
        ["Mina Patel", "Stripe", "Closed Won", "AE"],
        ["Jordan Lee", "Ramp", "In Progress", "AE"],
        ["Alex Rivera", frame.company || "—", frame.status, frame.role || "—"],
        ["Sara Kim", "Notion", "Follow Up", "PM"],
        ["Leo Chen", "Vercel", "Negotiation", "SE"],
    ];

    return (
        <div style={{ position: "relative", display: "flex", flexDirection: "column", background: sheetBg }}>
            <div
                style={{
                    padding: "10px 12px",
                    borderBottom: `1px solid ${C.border}`,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    color: C.textMuted,
                    fontSize: 11,
                    fontFamily: C.sans,
                }}
            >
                <div style={{ padding: "4px 8px", borderRadius: 6, background: tabBg }}>CRM Leads</div>
                <div style={{ padding: "4px 8px", borderRadius: 6, background: tabBg }}>March Pipeline</div>
            </div>

            <div
                style={{
                    position: "relative",
                    overflow: "hidden",
                    background: gradientBg,
                }}
            >
                <div>
                    <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 1, background: headerBg }}>
                        {(["Name", "Company", "Status", "Role"] as const).map((label) => {
                            const w = COL[label.toLowerCase() as keyof typeof COL];
                            return (
                                <div
                                    key={label}
                                    style={{
                                        width: w,
                                        minWidth: w,
                                        padding: "10px 12px",
                                        fontSize: 10,
                                        textTransform: "uppercase",
                                        letterSpacing: "0.06em",
                                        color: C.textMuted,
                                        borderRight: `1px solid ${C.border}`,
                                        borderBottom: `1px solid ${C.border}`,
                                        fontFamily: C.sans,
                                    }}
                                >
                                    {label}
                                </div>
                            );
                        })}
                    </div>

                    {rows.map(([name, company, status, role], index) => {
                        const isFocusRow = name === DEMO_FOCUS_NAME;

                        return (
                            <div key={`${name}-${index}`} style={{ display: "flex" }}>
                                <SpreadsheetCell width={COL.name} color={isFocusRow ? C.text : undefined} C={C}>
                                    {name}
                                </SpreadsheetCell>
                                <SpreadsheetCell width={COL.company} active={isFocusRow && frame.activeCell === "company"} C={C}>
                                    {company}
                                </SpreadsheetCell>
                                <SpreadsheetCell width={COL.status} active={isFocusRow && frame.activeCell === "status"} C={C}>
                                    {status}
                                    {isFocusRow && frame.dropdownOpen ? (
                                        <div
                                            style={{
                                                position: "absolute",
                                                top: "calc(100% + 4px)",
                                                left: 4,
                                                width: 96,
                                                background: C.raised,
                                                border: `1px solid ${C.border}`,
                                                borderRadius: 6,
                                                boxShadow: isLight ? "0 12px 32px rgba(0,0,0,0.1)" : "0 12px 32px rgba(0,0,0,0.35)",
                                                overflow: "hidden",
                                                zIndex: 3,
                                            }}
                                        >
                                            {DROPDOWN_OPTIONS.map((option) => (
                                                <div
                                                    key={option}
                                                    style={{
                                                        padding: "6px 10px",
                                                        fontSize: 11,
                                                        color: option === frame.status ? C.text : C.textSec,
                                                        background:
                                                            option === frame.status
                                                                ? dropdownHover
                                                                : "transparent",
                                                        cursor: "pointer",
                                                    }}
                                                >
                                                    {option}
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}
                                </SpreadsheetCell>
                                <SpreadsheetCell width={COL.role} active={isFocusRow && frame.activeCell === "role"} C={C}>
                                    {role}
                                </SpreadsheetCell>
                            </div>
                        );
                    })}
                </div>

                <div
                    style={{
                        position: "absolute",
                        left: cursorPos.left,
                        top: cursorPos.top,
                        pointerEvents: "none",
                        transition: "left 0.45s ease, top 0.45s ease",
                        zIndex: 4,
                    }}
                >
                    <svg
                        width="22"
                        height="28"
                        viewBox="0 0 22 28"
                        fill="none"
                        style={{ filter: "drop-shadow(0 1px 0 rgba(0,0,0,0.2))" }}
                    >
                        <path
                            d="M3 2L3.2 21.5L8.2 16.8L11.4 25.2L15.1 23.7L12 15.9L20 15.9L3 2Z"
                            fill={isLight ? "#1C2B33" : "#FFFFFF"}
                            stroke={isLight ? "#F5F1ED" : "#141414"}
                            strokeWidth="1.2"
                            strokeLinejoin="round"
                        />
                    </svg>
                </div>
            </div>
        </div>
    );
}

type BarVariant = "default" | "hero" | "appHero";

const BarRow = ({
    label,
    pct,
    time,
    barVariant = "default",
    C,
}: {
    label: string;
    pct: number;
    time: string;
    barVariant?: BarVariant;
    C: MockupColors;
}) => {
    const v =
        barVariant === "hero"
            ? {
                  gap: 12,
                  labelSize: 15,
                  labelWeight: 600 as const,
                  labelColor: C.text,
                  labelFlex: true as const,
                  labelW: 0,
                  barH: 6,
                  metaSize: 13,
                  metaW: 44,
                  pctW: 36,
              }
            : barVariant === "appHero"
              ? {
                    gap: 10,
                    labelSize: 12,
                    labelWeight: 500 as const,
                    labelColor: C.textSec,
                    labelFlex: false as const,
                    labelW: 140,
                    barH: 5,
                    metaSize: 11,
                    metaW: 40,
                    pctW: 32,
                }
              : {
                    gap: 6,
                    labelSize: 10,
                    labelWeight: 400 as const,
                    labelColor: C.textSec,
                    labelFlex: false as const,
                    labelW: 108,
                    barH: 3,
                    metaSize: 9,
                    metaW: 28,
                    pctW: 22,
                };

    const labelStyle = v.labelFlex
        ? { flex: 1 as const, minWidth: 0 as const }
        : { width: v.labelW, flexShrink: 0 as const };

    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: v.gap,
                fontSize: v.labelSize,
            }}
        >
            <span
                style={{
                    ...labelStyle,
                    color: v.labelColor,
                    fontWeight: v.labelWeight,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                }}
            >
                {label}
            </span>
            <div
                style={{
                    flex: 1,
                    height: v.barH,
                    background: C.muted,
                    borderRadius: 3,
                    overflow: "hidden",
                    minWidth: barVariant === "hero" ? 80 : 24,
                }}
            >
                <div style={{ height: "100%", width: `${pct}%`, background: C.accent, borderRadius: 3 }} />
            </div>
            <span
                style={{
                    width: v.metaW,
                    textAlign: "right",
                    color: C.textMuted,
                    fontSize: v.metaSize,
                    flexShrink: 0,
                }}
            >
                {time}
            </span>
            <span
                style={{
                    width: v.pctW,
                    textAlign: "right",
                    color: C.textMuted,
                    fontSize: v.metaSize,
                    flexShrink: 0,
                }}
            >
                {pct}%
            </span>
        </div>
    );
};

function OutputActivityBlock({ C }: { C: MockupColors }) {
    const sectionLabel = (label: string, prominent?: boolean) => (
        <div
            style={{
                fontSize: prominent ? 11 : 9,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: C.textMuted,
                marginBottom: prominent ? 12 : 8,
                fontFamily: C.sans,
            }}
        >
            {label}
        </div>
    );

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                background: C.bg,
                padding: "18px",
            }}
        >
            <div
                style={{
                    background: C.raised,
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    padding: "14px 16px",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <ChevronDown size={14} style={{ color: C.accent }} />
                    <span
                        style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: C.accent,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                        }}
                    >
                        Block 1
                    </span>
                    <span style={{ fontSize: 11, color: C.textSec }}>2:03 PM – 3:28 PM</span>
                    <span style={{ marginLeft: "auto", fontSize: 11, color: C.textMuted }}>1h 25m</span>
                    <span
                        style={{
                            fontSize: 10,
                            padding: "3px 9px",
                            background: `rgba(${C.uiRgb}, 0.06)`,
                            color: C.textMuted,
                            borderRadius: 4,
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                        }}
                    >
                        Ready
                    </span>
                </div>

                {sectionLabel("≈ Tasks", true)}
                <div style={{ marginBottom: 18 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <ChevronDown size={16} style={{ color: C.accent, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <BarRow label="Lead pipeline updates" pct={100} time="1h 25m" barVariant="hero" C={C} />
                        </div>
                    </div>
                    <div
                        style={{
                            fontSize: 15,
                            color: C.textSec,
                            lineHeight: 1.55,
                            padding: "10px 0 4px 26px",
                            fontFamily: C.sans,
                        }}
                    >
                        {FINAL_SUMMARY}
                    </div>
                </div>

                {sectionLabel("⊞ App Breakdown", true)}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 4 }}>
                    <BarRow label="Chrome" pct={42} time="36m" barVariant="appHero" C={C} />
                    <BarRow label="Claude" pct={28} time="24m" barVariant="appHero" C={C} />
                    <BarRow label="Slack" pct={18} time="15m" barVariant="appHero" C={C} />
                    <BarRow label="Cursor" pct={12} time="10m" barVariant="appHero" C={C} />
                </div>
            </div>
        </div>
    );
}

export const ProductDemoSection = ({ variant = "dark" }: { variant?: MockupVariant }) => {
    const C = getMockupColors(variant);
    const [frameIndex, setFrameIndex] = useState(0);

    useEffect(() => {
        const current = FRAMES[frameIndex];
        const timeout = window.setTimeout(() => {
            setFrameIndex((prev) => (prev === FRAMES.length - 1 ? 0 : prev + 1));
        }, current.durationMs);
        return () => window.clearTimeout(timeout);
    }, [frameIndex]);

    const frame = FRAMES[frameIndex];

    return (
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 48px 100px" }}>
            <div
                className="l-product-demo-row"
                style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
            >
                <div style={{ width: 360, flexShrink: 0, position: "relative" }}>
                    <div
                        className="l-product-demo-label"
                        style={{
                            textAlign: "center",
                            fontSize: 13,
                            color: C.textSec,
                            letterSpacing: "0.01em",
                            fontFamily: C.sans,
                            marginBottom: 14,
                        }}
                    >
                        Your team&apos;s work
                    </div>
                    <MacWindow title="Google Sheets" variant={variant}>
                        <InputSpreadsheet frame={frame} C={C} />
                    </MacWindow>
                    <DemoWatchingPill C={C} />
                </div>

                <div
                    style={{
                        width: 80,
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        paddingLeft: 24,
                        color: C.textMuted,
                        fontSize: 24,
                        fontFamily: C.serif,
                    }}
                >
                    →
                </div>

                <div style={{ width: 560, flexShrink: 0 }}>
                    <div
                        className="l-product-demo-label"
                        style={{
                            textAlign: "center",
                            fontSize: 13,
                            color: C.accent,
                            letterSpacing: "0.01em",
                            fontFamily: C.sans,
                            marginBottom: 14,
                        }}
                    >
                        Automatically summarised
                    </div>
                    <MacWindow title="Mitable" variant={variant}>
                        <OutputActivityBlock C={C} />
                    </MacWindow>
                </div>
            </div>

            <style>{`
                @keyframes demo-pulse {
                    0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.45); }
                    70% { box-shadow: 0 0 0 7px rgba(239,68,68,0); }
                    100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
                }

                @media (max-width: 1060px) {
                    .l-product-demo-row {
                        flex-direction: column !important;
                        align-items: center !important;
                        gap: 24px !important;
                    }
                    .l-product-demo-row > div {
                        width: 100% !important;
                        max-width: 560px !important;
                    }
                    .l-product-demo-row > div:nth-child(2) {
                        width: auto !important;
                        transform: rotate(90deg);
                    }
                }
            `}</style>
        </div>
    );
};
