"use client";

import { type MockupVariant, getMockupColors } from "./colors";

const SidebarItem = ({ label, active = false, C }: { label: string; active?: boolean; C: ReturnType<typeof getMockupColors> }) => (
    <div
        style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 14px",
            fontSize: 12,
            fontFamily: C.sans,
            color: active ? C.accent : C.textSec,
            background: active ? C.accentMuted : "transparent",
        }}
    >
        {label}
    </div>
);

const WeekDay = ({ day, date, active = false, C }: { day: string; date: number; active?: boolean; C: ReturnType<typeof getMockupColors> }) => (
    <div style={{ textAlign: "center", flex: 1 }}>
        <div style={{ fontSize: 9, color: C.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 4 }}>{day}</div>
        <div
            style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto",
                fontSize: 12,
                fontWeight: active ? 600 : 400,
                color: active ? C.bg : C.textSec,
                background: active ? C.accent : "transparent",
            }}
        >
            {date}
        </div>
    </div>
);

const BarRow = ({ label, pct, time, C }: { label: string; pct: number; time: string; C: ReturnType<typeof getMockupColors> }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
        <span style={{ width: 62, color: C.textSec, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{label}</span>
        <div style={{ flex: 1, height: 3, background: C.muted, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: C.accent, borderRadius: 2 }} />
        </div>
        <span style={{ width: 28, textAlign: "right" as const, color: C.textMuted, fontSize: 9, flexShrink: 0 }}>{time}</span>
        <span style={{ width: 22, textAlign: "right" as const, color: C.textMuted, fontSize: 9, flexShrink: 0 }}>{pct}%</span>
    </div>
);

export const HeroActivityMockup = ({ variant = "dark" }: { variant?: MockupVariant }) => {
    const C = getMockupColors(variant);

    return (
        <div style={{ display: "flex", height: 400, fontFamily: C.sans }}>
            <div
                style={{
                    width: 140,
                    background: C.raised,
                    borderRight: `1px solid ${C.border}`,
                    padding: "14px 0",
                    flexShrink: 0,
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                <div>
                    <SidebarItem label="Calendar" active C={C} />
                    <SidebarItem label="Me" C={C} />
                    <SidebarItem label="Agent" C={C} />
                    <SidebarItem label="Docs" C={C} />
                    <SidebarItem label="Uploads" C={C} />
                </div>
                <div style={{ marginTop: "auto" }}>
                    <div style={{ padding: "6px 14px", fontSize: 11, color: C.textMuted }}>↕ Switch to Admin View</div>
                    <div
                        style={{
                            padding: "10px 14px",
                            borderTop: `1px solid ${C.border}`,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                        }}
                    >
                        <div
                            style={{
                                width: 24,
                                height: 24,
                                borderRadius: "50%",
                                background: C.accent,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 10,
                                fontWeight: 600,
                                color: C.bg,
                            }}
                        >
                            M
                        </div>
                        <div>
                            <div style={{ fontSize: 11, color: C.text, fontWeight: 500 }}>Mikun</div>
                            <div style={{ fontSize: 9, color: C.textMuted }}>Free plan</div>
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ flex: 1, background: C.bg, overflowY: "auto", padding: "14px 18px" }}>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 2,
                        marginBottom: 16,
                        padding: "8px 0",
                    }}
                >
                    <span style={{ fontSize: 10, color: C.textMuted, cursor: "pointer", padding: "0 4px" }}>‹</span>
                    <WeekDay day="SUN" date={22} C={C} />
                    <WeekDay day="MON" date={23} C={C} />
                    <WeekDay day="TUE" date={24} C={C} />
                    <WeekDay day="WED" date={25} active C={C} />
                    <WeekDay day="THU" date={26} C={C} />
                    <WeekDay day="FRI" date={27} C={C} />
                    <WeekDay day="SAT" date={28} C={C} />
                    <span style={{ fontSize: 10, color: C.textMuted, cursor: "pointer", padding: "0 4px" }}>›</span>
                </div>

                <div style={{ fontFamily: C.serif, fontSize: 18, fontWeight: 400, color: C.text, marginBottom: 4 }}>Wednesday, March 25</div>
                <div style={{ fontSize: 11, color: C.accent, marginBottom: 16, fontStyle: "italic" }}>4h 38m recorded</div>

                <div
                    style={{
                        fontSize: 9,
                        textTransform: "uppercase" as const,
                        letterSpacing: "0.08em",
                        color: C.textMuted,
                        marginBottom: 8,
                    }}
                >
                    Activity
                </div>

                <div
                    style={{
                        background: C.raised,
                        border: `1px solid ${C.border}`,
                        borderRadius: 10,
                        padding: "12px 14px",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, color: C.accent, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
                            Block 3
                        </span>
                        <span style={{ fontSize: 10, color: C.textSec }}>3:03 PM - 4:28 PM</span>
                        <span style={{ marginLeft: "auto", fontSize: 10, color: C.textMuted }}>⏱ 1h 26m</span>
                        <span
                            style={{
                                fontSize: 9,
                                padding: "2px 8px",
                                background: `rgba(${C.uiRgb}, 0.06)`,
                                color: C.textMuted,
                                borderRadius: 4,
                                textTransform: "uppercase" as const,
                                letterSpacing: "0.04em",
                            }}
                        >
                            Ready
                        </span>
                    </div>

                    <div style={{ fontSize: 9, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: C.textMuted, marginBottom: 8 }}>
                        ≈ Tasks
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
                        <div>
                            <BarRow label="Slack Admin Offboarding" pct={46} time="39m" C={C} />
                            <div
                                style={{
                                    fontSize: 10,
                                    color: C.textSec,
                                    lineHeight: 1.5,
                                    padding: "6px 0 4px 0",
                                    maxWidth: 340,
                                }}
                            >
                                Researched how to deactivate users from Slack as an admin. Used Claude to find the process for completing the offboarding
                                started in Google&apos;s Admin dashboard.
                            </div>
                        </div>
                        <BarRow label="Implementation" pct={28} time="24m" C={C} />
                        <BarRow label="Google Admin" pct={15} time="13m" C={C} />
                        <BarRow label="Documentation" pct={11} time="9m" C={C} />
                    </div>

                    <div style={{ fontSize: 9, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: C.textMuted, marginBottom: 8 }}>
                        ⊞ App Breakdown
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <BarRow label="Claude" pct={56} time="48m" C={C} />
                        <BarRow label="Google Chrome" pct={22} time="19m" C={C} />
                        <BarRow label="Slack" pct={16} time="14m" C={C} />
                        <BarRow label="Finder" pct={6} time="5m" C={C} />
                    </div>
                </div>
            </div>
        </div>
    );
};
