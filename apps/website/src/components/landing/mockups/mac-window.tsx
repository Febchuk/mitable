"use client";

/** Single source of truth for all landing page screen mockup proportions */
export const SCREEN_ASPECT_RATIO = "16 / 10";

interface MacWindowProps {
    children: React.ReactNode;
    className?: string;
    title?: string;
}

export const MacWindow = ({ children, className = "", title }: MacWindowProps) => (
    <div
        className={className}
        style={{
            background: "var(--l-bg, #1A1916)",
            borderRadius: 12,
            border: "1px solid var(--l-border, #33312B)",
            overflow: "hidden",
            boxShadow: "0 24px 80px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.2)",
        }}
    >
        <div
            style={{
                display: "flex",
                alignItems: "center",
                padding: "11px 14px",
                gap: 7,
                background: "var(--l-bg-raised, #211F1B)",
                borderBottom: "1px solid var(--l-border, #33312B)",
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
                        color: "var(--l-text-muted, #706B60)",
                        fontFamily: 'var(--font-dm-sans, "DM Sans"), system-ui, sans-serif',
                        marginRight: 31,
                    }}
                >
                    {title}
                </span>
            ) : null}
        </div>
        <div style={{ overflow: "hidden", aspectRatio: SCREEN_ASPECT_RATIO }}>{children}</div>
    </div>
);
