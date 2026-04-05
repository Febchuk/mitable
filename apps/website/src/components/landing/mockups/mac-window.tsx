"use client";

import { type MockupVariant, getMockupColors } from "./colors";

/** Single source of truth for all landing page screen mockup proportions */
export const SCREEN_ASPECT_RATIO = "16 / 10";

interface MacWindowProps {
    children: React.ReactNode;
    className?: string;
    title?: string;
    variant?: MockupVariant;
}

export const MacWindow = ({ children, className = "", title, variant = "dark" }: MacWindowProps) => {
    const C = getMockupColors(variant);
    const isLight = variant === "light";

    return (
        <div
            className={`l-mac-window ${className}`.trim()}
            style={{
                background: C.bg,
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                overflow: "hidden",
                boxShadow: isLight ? "0 24px 80px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)" : "0 24px 80px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.2)",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "11px 14px",
                    gap: 7,
                    background: C.raised,
                    borderBottom: `1px solid ${C.border}`,
                }}
            >
                <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57" }} />
                <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#febc2e" }} />
                <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840" }} />
                {title ? (
                    <span
                        style={{
                            flex: 1,
                            textAlign: "center",
                            fontSize: 12,
                            color: C.textMuted,
                            fontFamily: C.sans,
                            marginRight: 31,
                        }}
                    >
                        {title}
                    </span>
                ) : null}
            </div>
            <div className="l-mac-window-body" style={{ overflow: "hidden", aspectRatio: SCREEN_ASPECT_RATIO }}>
                {children}
            </div>
        </div>
    );
};
