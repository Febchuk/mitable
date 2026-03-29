"use client";

const C = {
    bg: "var(--l-bg, #1A1916)",
    text: "var(--l-text, #ECE8E0)",
    textSec: "var(--l-text-secondary, #A09A8E)",
    borderSubtle: "var(--l-border-subtle, #2A2824)",
    serif: 'var(--font-newsreader, "Newsreader"), Georgia, serif',
    sans: 'var(--font-dm-sans, "DM Sans"), system-ui, sans-serif',
};

const navLinks = [
    { label: "About Us", href: "#" },
    { label: "How it works", href: "#" },
    { label: "Pricing", href: "/pricing" },
    { label: "FAQs", href: "#" },
];

export const LandingNav = () => (
    <nav
        style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            padding: "18px 48px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "color-mix(in srgb, var(--l-bg, #1A1916) 82%, transparent)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            borderBottom: `1px solid ${C.borderSubtle}`,
            fontFamily: C.sans,
        }}
    >
        <a
            href="/"
            style={{
                fontFamily: C.serif,
                fontSize: 22,
                fontWeight: 500,
                color: C.text,
                textDecoration: "none",
                letterSpacing: "-0.02em",
            }}
        >
            Mitable
        </a>

        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 28,
                }}
                className="landing-nav-links"
            >
                {navLinks.map((link) => (
                    <a
                        key={link.label}
                        href={link.href}
                        style={{
                            color: C.textSec,
                            textDecoration: "none",
                            fontSize: 14,
                            fontWeight: 400,
                            transition: "color 0.2s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = C.text; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--l-text-secondary, #A09A8E)"; }}
                    >
                        {link.label}
                    </a>
                ))}
            </div>
            <a
                href="/download"
                style={{
                    background: C.text,
                    color: C.bg,
                    padding: "8px 20px",
                    borderRadius: 8,
                    fontWeight: 500,
                    fontSize: 14,
                    textDecoration: "none",
                    transition: "opacity 0.2s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
            >
                Download
            </a>
        </div>
        <style>{`
            @media (max-width: 960px) {
                .landing-nav-links { display: none !important; }
            }
        `}</style>
    </nav>
);
