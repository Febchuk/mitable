"use client";

const C = {
    text: "var(--l-text, #ECE8E0)",
    textSec: "var(--l-text-secondary, #A09A8E)",
    textMuted: "var(--l-text-muted, #706B60)",
    borderSubtle: "var(--l-border-subtle, #2A2824)",
    sans: 'var(--font-dm-sans, "DM Sans"), system-ui, sans-serif',
};

const links = [
    { label: "About Us", href: "#" },
    { label: "How it works", href: "#" },
    { label: "Pricing", href: "/pricing" },
    { label: "FAQs", href: "#" },
    { label: "Contact", href: "/contact" },
];

export const LandingFooter = () => (
    <footer
        style={{
            borderTop: `1px solid ${C.borderSubtle}`,
            padding: "40px 48px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            maxWidth: 1240,
            margin: "0 auto",
            fontFamily: C.sans,
            flexWrap: "wrap",
            gap: 20,
        }}
    >
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            {links.map((link) => (
                <a
                    key={link.label}
                    href={link.href}
                    style={{
                        color: C.textMuted,
                        textDecoration: "none",
                        fontSize: 13,
                        transition: "color 0.2s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--l-text-secondary, #A09A8E)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--l-text-muted, #706B60)"; }}
                >
                    {link.label}
                </a>
            ))}
        </div>
        <div style={{ fontSize: 12, color: C.textMuted }}>© 2026 Mitable</div>
    </footer>
);
