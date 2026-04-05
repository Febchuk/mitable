"use client";

import type { ReactNode } from "react";
import type { MockupVariant } from "./colors";
import { MacWindow } from "./mac-window";

interface MobileMockupClipProps {
    children: ReactNode;
    variant?: MockupVariant;
    /** Skip MacWindow wrapper (mockup already includes one) */
    raw?: boolean;
}

/**
 * Renders the mockup at a wider-than-viewport size and clips the right edge,
 * giving a "peeking from the left" effect with a gradient fade-out.
 * Only rendered inside containers gated to mobile via CSS (l-feature-visual-mobile).
 */
export const MobileMockupClip = ({ children, variant = "dark", raw = false }: MobileMockupClipProps) => {
    const inner = raw ? children : <MacWindow variant={variant}>{children}</MacWindow>;

    return (
        <div
            style={{
                position: "relative",
                width: "100%",
                overflow: "hidden",
                borderRadius: 12,
            }}
        >
            <div style={{ width: "min(720px, 180vw)" }}>{inner}</div>
            <div
                style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    width: 80,
                    height: "100%",
                    background: "linear-gradient(to right, transparent, var(--l-bg, #1A1916))",
                    pointerEvents: "none",
                }}
            />
        </div>
    );
};
