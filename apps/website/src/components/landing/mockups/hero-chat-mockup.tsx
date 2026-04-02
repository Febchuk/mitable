"use client";

import { getMockupColors, type MockupVariant } from "./colors";

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
            cursor: "default",
        }}
    >
        {label}
    </div>
);

export const HeroChatMockup = ({ variant = "dark" }: { variant?: MockupVariant }) => {
    const C = getMockupColors(variant);
    const isLight = variant === "light";

    return (
        <div style={{ display: "flex", height: 400, fontFamily: C.sans }}>
            <div
                style={{
                    width: 140,
                    background: C.raised,
                    borderRight: `1px solid ${C.border}`,
                    padding: "14px 0",
                    flexShrink: 0,
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                <div>
                    <SidebarItem label="Calendar" C={C} />
                    <SidebarItem label="Me" C={C} />
                    <SidebarItem label="Agent" active C={C} />
                    <SidebarItem label="Docs" C={C} />
                    <SidebarItem label="Uploads" C={C} />
                </div>
                <div style={{ marginTop: "auto" }}>
                    <div
                        style={{
                            padding: "6px 14px",
                            fontSize: 11,
                            color: C.textMuted,
                        }}
                    >
                        ↕ Switch to Admin View
                    </div>
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

            <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.bg }}>
                <div style={{ flex: 1, padding: "20px 20px 10px", overflowY: "auto" }}>
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
                        <div
                            style={{
                                background: `rgba(${C.uiRgb}, 0.08)`,
                                color: C.text,
                                padding: "9px 14px",
                                borderRadius: "18px 18px 4px 18px",
                                fontSize: 13,
                                maxWidth: "80%",
                                lineHeight: 1.5,
                            }}
                        >
                            how to delete someone from Slack as an admin
                        </div>
                    </div>

                    <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 10 }}>
                        Identified straightforward administrative task{" "}
                        <span style={{ color: C.textMuted }}>›</span>
                    </div>

                    <div style={{ fontSize: 12, lineHeight: 1.75, color: C.textSec }}>
                        <p style={{ marginBottom: 10 }}>
                            Here&apos;s how to remove (deactivate) a member from your Slack workspace as
                            an admin:
                        </p>
                        <p
                            style={{
                                fontWeight: 600,
                                color: C.text,
                                marginBottom: 6,
                                marginTop: 12,
                                fontSize: 12,
                            }}
                        >
                            Via the Admin Dashboard (most common)
                        </p>
                        <ol
                            style={{
                                paddingLeft: 18,
                                margin: 0,
                                display: "flex",
                                flexDirection: "column",
                                gap: 3,
                            }}
                        >
                            <li>
                                Go to your workspace URL, e.g.{" "}
                                <span
                                    style={{
                                        background: `rgba(${C.uiRgb}, 0.06)`,
                                        padding: "1px 6px",
                                        borderRadius: 4,
                                        fontSize: 11,
                                        color: C.text,
                                    }}
                                >
                                    yourworkspace.slack.com/admin
                                </span>
                            </li>
                            <li>
                                Click <strong style={{ color: C.text, fontWeight: 500 }}>Members</strong>{" "}
                                in the left sidebar
                            </li>
                            <li>Find the person using the search bar</li>
                            <li>
                                Click the{" "}
                                <strong style={{ color: C.text, fontWeight: 500 }}>three-dot menu (⋯)</strong>{" "}
                                next to their name
                            </li>
                            <li>
                                Select{" "}
                                <strong style={{ color: C.text, fontWeight: 500 }}>
                                    Deactivate account
                                </strong>
                            </li>
                            <li>Confirm the deactivation</li>
                        </ol>
                    </div>
                </div>

                <div
                    style={{
                        padding: "10px 20px 14px",
                        borderTop: `1px solid ${C.border}`,
                        background: C.bg,
                    }}
                >
                    <div
                        style={{
                            padding: "8px 12px",
                            background: isLight ? `rgba(${C.uiRgb}, 0.04)` : "rgba(51,49,43,0.6)",
                            border: `1px solid ${C.border}`,
                            borderRadius: 8,
                            fontSize: 11,
                            color: C.textMuted,
                        }}
                    >
                        What can I help with?
                    </div>
                </div>
            </div>
        </div>
    );
};
