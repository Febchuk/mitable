"use client";

import Link from "next/link";

const C = {
    text: "var(--l-text, #ECE8E0)",
    textSec: "var(--l-text-secondary, #A09A8E)",
    textMuted: "var(--l-text-muted, #706B60)",
    borderSubtle: "var(--l-border-subtle, #2A2824)",
    sans: 'var(--font-dm-sans, "DM Sans"), system-ui, sans-serif',
};

/** Same order as `navLinks` in landing-nav.tsx, then Contact (not in nav). */
const links = [
    { label: "How it works", href: "/#how-it-works" },
    { label: "Pricing", href: "/pricing" },
    { label: "Blog", href: "/blog" },
    { label: "About", href: "/about" },
    { label: "FAQs", href: "/faq" },
    { label: "Contact", href: "/contact" },
];

export const LandingFooter = () => (
    <footer
        className="l-landing-footer"
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
        <div className="l-landing-footer-links" style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            {links.map((link) => (
                <Link
                    key={link.label}
                    href={link.href}
                    style={{
                        color: C.textMuted,
                        textDecoration: "none",
                        fontSize: 13,
                        transition: "color 0.2s",
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--l-text-secondary, #A09A8E)";
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--l-text-muted, #706B60)";
                    }}
                >
                    {link.label}
                </Link>
            ))}
        </div>
        <div style={{ fontSize: 12, color: C.textMuted }}>© 2026 Mitable</div>
    </footer>
);
