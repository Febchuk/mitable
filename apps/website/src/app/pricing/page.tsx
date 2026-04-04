"use client";

import { useState, type ReactNode } from "react";
import { getPricingTier } from "@mitable/shared";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingFooter } from "@/components/landing";
import { useTheme } from "@/hooks/use-theme";
import { API_URL } from "@/lib/api";
import { supabase } from "@/lib/supabase";

const C = {
    bg: "var(--l-bg, #1A1916)",
    raised: "var(--l-bg-raised, #211F1B)",
    overlay: "var(--l-bg-overlay, #2A2824)",
    text: "var(--l-text, #ECE8E0)",
    textSec: "var(--l-text-secondary, #A09A8E)",
    textTer: "var(--l-text-tertiary, #6B665C)",
    accent: "var(--l-accent, #82C0CC)",
    border: "var(--l-border, #33312B)",
    serif: 'var(--font-newsreader, "Newsreader"), Georgia, serif',
    sans: 'var(--font-dm-sans, "DM Sans"), system-ui, sans-serif',
    /** Legible on solid accent fills (not themed — accent is brand cyan in both modes). */
    onAccentText: "#0F2529",
};

type BillingPeriod = "monthly" | "yearly";

const FREE_BULLETS = [
    "Work session recording (up to 3 hours/day)",
    "Automatic work summaries",
    "Bragbook — personal accomplishment tracker",
    "Work analytics dashboard",
    "Unlimited doc generation",
    "Direct access to the founders",
];

const PRO_BULLETS = [
    "Unlimited recording",
    "AI agent",
    "MCP integrations",
    "Shareable Bragbook highlights",
];

const TEAMS_BULLETS = [
    "Real-time visibility into your team's work",
    "Performance benchmarking and scoring",
    "Team performance dashboard",
    "Centralised billing",
    "Manager privacy controls",
];

const ENTERPRISE_BULLETS = [
    "Internal expert routing",
    "Dedicated onboarding",
    "Priority support",
    "SSO",
    "Audit logs",
];

function CheckBullet({ children, accent }: { children: ReactNode; accent?: boolean }) {
    return (
        <li style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <div
                style={{
                    width: 15,
                    height: 15,
                    borderRadius: "50%",
                    background: accent ? "rgba(var(--l-accent-rgb, 130,192,204), 0.12)" : "rgba(var(--l-ui-rgb, 236,232,224), 0.04)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginTop: 2,
                }}
            >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={accent ? C.accent : C.textTer} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                </svg>
            </div>
            <span style={{ fontSize: 14, color: C.textSec, lineHeight: 1.42 }}>{children}</span>
        </li>
    );
}

export default function PricingPage() {
    const { theme: colorMode } = useTheme();
    const [billing, setBilling] = useState<BillingPeriod>("yearly");
    const [loading, setLoading] = useState<string | null>(null);

    const toggleActiveBg = colorMode === "light" ? "var(--l-bg-muted, #E8E2DC)" : C.overlay;

    const proTier = getPricingTier("pro");
    const proMonthlyStripeId = proTier?.pricing.global.stripePriceId ?? null;
    const proYearlyStripeId = process.env.NEXT_PUBLIC_STRIPE_PRO_YEARLY_PRICE_ID?.trim() || null;
    const teamMonthlyStripeId = process.env.NEXT_PUBLIC_STRIPE_TEAM_PRICE_ID?.trim() || null;
    const teamYearlyStripeId = process.env.NEXT_PUBLIC_STRIPE_TEAM_YEARLY_PRICE_ID?.trim() || null;

    const handleCheckout = async (stripePriceId: string | null, loadingKey: string) => {
        if (!stripePriceId) return;
        setLoading(loadingKey);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { window.location.href = "/login?redirect=/pricing"; return; }
            const res = await fetch(`${API_URL}/api/stripe/create-checkout-session`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({
                    priceId: stripePriceId,
                    successUrl: `${window.location.origin}/checkout/success`,
                    cancelUrl: `${window.location.origin}/checkout/cancel`,
                }),
            });
            if (res.status === 401) { await supabase.auth.signOut(); window.location.href = "/login?redirect=/pricing"; return; }
            const data = await res.json();
            if (data.url) window.location.href = data.url;
        } catch (error) {
            console.error("Checkout error:", error);
        } finally {
            setLoading(null);
        }
    };

    /** Prefer annual Stripe price when yearly + env set; otherwise fall back to monthly checkout. */
    const proPriceId = billing === "yearly" && proYearlyStripeId ? proYearlyStripeId : proMonthlyStripeId;
    const teamPriceId = billing === "yearly" && teamYearlyStripeId ? teamYearlyStripeId : teamMonthlyStripeId;

    const PRO_MONTHLY = "$20";
    const PRO_YEARLY = "$16";
    const TEAMS_MONTHLY = "$40";
    const TEAMS_YEARLY = "$32";

    const proDisplay =
        billing === "yearly"
            ? { amount: PRO_YEARLY, strikethrough: PRO_MONTHLY, period: "/month" }
            : { amount: PRO_MONTHLY, period: "/month" };

    const teamsDisplay =
        billing === "yearly"
            ? { amount: TEAMS_YEARLY, strikethrough: TEAMS_MONTHLY, period: "/user/month" }
            : { amount: TEAMS_MONTHLY, period: "/user/month" };

    /** Cursor-like: muted track, lighter inner pill when selected, bright label on active. */
    const toggleSegment = (active: boolean) => ({
        width: "100%",
        boxSizing: "border-box" as const,
        padding: "8px 22px",
        borderRadius: 999,
        fontSize: 14,
        fontWeight: active ? 600 : 500,
        border: "none",
        cursor: "pointer",
        fontFamily: C.sans,
        transition: "background 0.15s ease, color 0.15s ease",
        background: active ? toggleActiveBg : "transparent",
        color: active ? C.text : C.textTer,
        boxShadow: "none",
        display: "flex" as const,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        textAlign: "center" as const,
    });

    const cardShell = (recommended: boolean) => ({
        display: "flex",
        flexDirection: "column" as const,
        padding: "18px 18px 16px",
        borderRadius: 12,
        background: C.raised,
        border: recommended ? "1px solid rgba(var(--l-accent-rgb, 130,192,204), 0.2)" : `1px solid ${C.border}`,
        position: "relative" as const,
        minHeight: 0,
        height: "100%",
    });

    /** Section headings above plan rows — high contrast vs page background. */
    const plansSectionLabel = {
        fontFamily: C.sans,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase" as const,
        color: C.accent,
        marginBottom: 12,
        marginTop: 0,
    };

    const twoCol = {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 16,
        alignItems: "stretch",
    };

    const ctaPad = { padding: "8px 0" as const, marginBottom: 12 as const };
    const priceNum = { fontFamily: C.serif, fontSize: 34, fontWeight: 300, color: C.text, letterSpacing: -1.5, lineHeight: 1 } as const;

    /** Fixed slots so tier / price / CTA align across cards in the same row (Cursor-style). */
    const cardTop = {
        tierSlot: {
            minHeight: 22,
            display: "flex" as const,
            alignItems: "center" as const,
            marginBottom: 8,
        },
        priceSlot: {
            minHeight: billing === "yearly" ? 56 : 48,
            display: "flex" as const,
            flexDirection: "row" as const,
            alignItems: "center" as const,
            justifyContent: "space-between" as const,
            gap: 12,
            flexWrap: "wrap" as const,
            marginBottom: 10,
        },
        tierText: {
            fontSize: 11,
            fontWeight: 600,
            color: C.textSec,
            textTransform: "uppercase" as const,
            letterSpacing: "0.09em",
            margin: 0,
            lineHeight: 1.2,
        },
    };

    const recommendedPill = {
        display: "inline-flex" as const,
        alignItems: "center" as const,
        gap: 6,
        fontSize: 11,
        fontWeight: 600,
        color: C.accent,
        textTransform: "uppercase" as const,
        letterSpacing: "0.09em",
        padding: "3px 8px",
        borderRadius: 999,
        background: "rgba(var(--l-accent-rgb, 130,192,204), 0.12)",
        border: "1px solid rgba(var(--l-accent-rgb, 130,192,204), 0.25)",
        flexShrink: 0,
        whiteSpace: "nowrap" as const,
    };

    return (
        <div className="landing" style={{ minHeight: "100dvh", background: C.bg, fontFamily: C.sans }}>
            <style>{`
                @media (max-width: 900px) {
                    .pricing-plan-grid { grid-template-columns: 1fr !important; }
                }
                /* Tighter chrome on desktop when vertical space is limited (both plan rows visible). */
                @media (min-width: 901px) and (max-height: 900px) {
                    .pricing-page-main {
                        padding-top: 128px !important;
                        padding-bottom: 16px !important;
                    }
                    .pricing-compact-header {
                        margin-bottom: 12px !important;
                    }
                }
            `}</style>
            <LandingNav />

            <main className="pricing-page-main" style={{ padding: "120px 48px 56px", maxWidth: 1200, margin: "0 auto" }}>
                <div className="pricing-compact-header" style={{ textAlign: "center", marginBottom: 40 }}>
                    <h1
                        style={{
                            fontFamily: C.serif,
                            fontSize: 40,
                            fontWeight: 400,
                            color: C.text,
                            letterSpacing: "-0.03em",
                            lineHeight: 1.12,
                            margin: "0 0 20px",
                        }}
                    >
                        Pricing
                    </h1>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "center",
                            paddingTop: 14,
                            marginBottom: 2,
                        }}
                    >
                        <div style={{ position: "relative", display: "inline-block" }}>
                            <div
                                style={{
                                    display: "inline-grid",
                                    gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
                                    alignItems: "stretch",
                                    gap: 2,
                                    padding: 2,
                                    borderRadius: 999,
                                    background: C.raised,
                                    border: `1px solid rgba(var(--l-ui-rgb, 236,232,224), 0.1)`,
                                }}
                            >
                                <button type="button" style={toggleSegment(billing === "monthly")} onClick={() => setBilling("monthly")}>
                                    Monthly
                                </button>
                                <div
                                    style={{
                                        position: "relative",
                                        minWidth: 0,
                                        display: "flex",
                                        alignItems: "stretch",
                                    }}
                                >
                                    <button type="button" style={toggleSegment(billing === "yearly")} onClick={() => setBilling("yearly")}>
                                        Yearly
                                    </button>
                                    <span
                                        aria-hidden
                                        style={{
                                            position: "absolute",
                                            top: -13,
                                            right: -14,
                                            zIndex: 2,
                                            fontSize: 9,
                                            fontWeight: 700,
                                            letterSpacing: "0.07em",
                                            textTransform: "uppercase" as const,
                                            color: C.onAccentText,
                                            background: C.accent,
                                            padding: "4px 7px",
                                            borderRadius: 6,
                                            lineHeight: 1.2,
                                            whiteSpace: "nowrap",
                                            pointerEvents: "none",
                                            border: "1px solid rgba(var(--l-accent-rgb, 130,192,204), 0.45)",
                                            boxShadow: "0 12px 28px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2)",
                                            backdropFilter: "blur(10px)",
                                        }}
                                    >
                                        20% OFF
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Individual Plans */}
                <p style={plansSectionLabel}>Individual Plans</p>
                <div className="pricing-plan-grid" style={{ ...twoCol, marginBottom: 52 }}>
                    {/* Free */}
                    <div style={cardShell(false)}>
                        <div style={cardTop.tierSlot}>
                            <span style={cardTop.tierText}>Free</span>
                        </div>
                        <div style={cardTop.priceSlot}>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 4, flexWrap: "wrap" }}>
                                <span style={priceNum}>$0</span>
                            </div>
                        </div>
                        <a
                            href="/download"
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                ...ctaPad,
                                borderRadius: 10,
                                fontSize: 14,
                                fontWeight: 500,
                                textDecoration: "none",
                                color: C.text,
                                border: `1px solid ${C.border}`,
                                background: "transparent",
                            }}
                        >
                            Download
                        </a>
                        <div style={{ height: 1, background: "rgba(var(--l-ui-rgb, 236,232,224), 0.04)", marginBottom: 8 }} />
                        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
                            {FREE_BULLETS.map((t) => (
                                <CheckBullet key={t}>{t}</CheckBullet>
                            ))}
                        </ul>
                    </div>

                    {/* Pro */}
                    <div style={cardShell(true)}>
                        <div style={cardTop.tierSlot}>
                            <span style={cardTop.tierText}>Pro</span>
                        </div>
                        <div style={cardTop.priceSlot}>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                                {"strikethrough" in proDisplay && proDisplay.strikethrough ? (
                                    <>
                                        <span
                                            style={{
                                                fontFamily: priceNum.fontFamily,
                                                fontSize: 22,
                                                fontWeight: 300,
                                                color: C.textTer,
                                                textDecoration: "line-through",
                                                letterSpacing: "-0.04em",
                                                lineHeight: 1,
                                            }}
                                        >
                                            {proDisplay.strikethrough}
                                        </span>
                                        <span style={priceNum}>{proDisplay.amount}</span>
                                    </>
                                ) : (
                                    <span style={priceNum}>{proDisplay.amount}</span>
                                )}
                                <span style={{ fontSize: 13, color: C.textSec }}>{proDisplay.period}</span>
                            </div>
                            <span style={recommendedPill}>Recommended</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => proPriceId && handleCheckout(proPriceId, "pro")}
                            disabled={loading === "pro" || !proPriceId}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                ...ctaPad,
                                borderRadius: 10,
                                fontSize: 14,
                                fontWeight: 500,
                                cursor: proPriceId ? "pointer" : "not-allowed",
                                color: C.bg,
                                background: C.text,
                                border: "none",
                                width: "100%",
                                opacity: proPriceId ? 1 : 0.5,
                            }}
                        >
                            {loading === "pro" ? "Redirecting..." : "Get Pro"}
                        </button>
                        <div style={{ height: 1, background: "rgba(var(--l-ui-rgb, 236,232,224), 0.04)", marginBottom: 8 }} />
                        <p style={{ fontSize: 12, fontWeight: 600, color: C.textSec, margin: "0 0 6px", lineHeight: 1.35 }}>
                            Everything in Free, plus:
                        </p>
                        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
                            {PRO_BULLETS.map((t) => (
                                <CheckBullet key={t} accent>
                                    {t}
                                </CheckBullet>
                            ))}
                        </ul>
                    </div>
                </div>

                {/* Team Plans */}
                <p style={{ ...plansSectionLabel, marginTop: 0 }}>Team Plans</p>
                <div className="pricing-plan-grid" style={twoCol}>
                    {/* Teams */}
                    <div style={cardShell(false)}>
                        <div style={cardTop.tierSlot}>
                            <span style={cardTop.tierText}>Teams</span>
                        </div>
                        <div style={cardTop.priceSlot}>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                                {"strikethrough" in teamsDisplay && teamsDisplay.strikethrough ? (
                                    <>
                                        <span
                                            style={{
                                                fontFamily: priceNum.fontFamily,
                                                fontSize: 22,
                                                fontWeight: 300,
                                                color: C.textTer,
                                                textDecoration: "line-through",
                                                letterSpacing: "-0.04em",
                                                lineHeight: 1,
                                            }}
                                        >
                                            {teamsDisplay.strikethrough}
                                        </span>
                                        <span style={priceNum}>{teamsDisplay.amount}</span>
                                    </>
                                ) : (
                                    <span style={priceNum}>{teamsDisplay.amount}</span>
                                )}
                                <span style={{ fontSize: 13, color: C.textSec }}>{teamsDisplay.period}</span>
                            </div>
                        </div>
                        {teamPriceId ? (
                            <button
                                type="button"
                                onClick={() => handleCheckout(teamPriceId, "teams")}
                                disabled={loading === "teams"}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    ...ctaPad,
                                    borderRadius: 10,
                                    fontSize: 14,
                                    fontWeight: 500,
                                    cursor: "pointer",
                                    color: C.text,
                                    background: "transparent",
                                    border: `1px solid ${C.border}`,
                                    width: "100%",
                                }}
                            >
                                {loading === "teams" ? "Redirecting..." : "Get Teams"}
                            </button>
                        ) : (
                            <a
                                href="/contact"
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    ...ctaPad,
                                    borderRadius: 10,
                                    fontSize: 14,
                                    fontWeight: 500,
                                    textDecoration: "none",
                                    color: C.text,
                                    border: `1px solid ${C.border}`,
                                    background: "transparent",
                                }}
                            >
                                Get Teams
                            </a>
                        )}
                        <div style={{ height: 1, background: "rgba(var(--l-ui-rgb, 236,232,224), 0.04)", marginBottom: 8 }} />
                        <p style={{ fontSize: 12, fontWeight: 600, color: C.textSec, margin: "0 0 6px", lineHeight: 1.35 }}>
                            Everything in Pro, plus:
                        </p>
                        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
                            {TEAMS_BULLETS.map((t) => (
                                <CheckBullet key={t}>{t}</CheckBullet>
                            ))}
                        </ul>
                    </div>

                    {/* Enterprise */}
                    <div style={cardShell(false)}>
                        <div style={cardTop.tierSlot}>
                            <span style={cardTop.tierText}>Enterprise</span>
                        </div>
                        <div style={cardTop.priceSlot}>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 4, flexWrap: "wrap" }}>
                                <span style={{ ...priceNum, letterSpacing: "-0.02em" }}>Custom pricing</span>
                            </div>
                        </div>
                        <a
                            href="/contact"
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                ...ctaPad,
                                borderRadius: 10,
                                fontSize: 14,
                                fontWeight: 500,
                                textDecoration: "none",
                                color: C.text,
                                border: `1px solid ${C.border}`,
                                background: "transparent",
                            }}
                        >
                            Contact Sales
                        </a>
                        <div style={{ height: 1, background: "rgba(var(--l-ui-rgb, 236,232,224), 0.04)", marginBottom: 8 }} />
                        <p style={{ fontSize: 12, fontWeight: 600, color: C.textSec, margin: "0 0 6px", lineHeight: 1.35 }}>
                            Everything in Teams, plus:
                        </p>
                        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
                            {ENTERPRISE_BULLETS.map((t) => (
                                <CheckBullet key={t}>{t}</CheckBullet>
                            ))}
                        </ul>
                    </div>
                </div>
            </main>

            <LandingFooter />
        </div>
    );
}
