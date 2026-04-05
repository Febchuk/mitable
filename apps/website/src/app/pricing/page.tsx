"use client";

import { useState } from "react";
import { PRICING_TIERS } from "@mitable/shared";
import { LandingFooter } from "@/components/landing";
import { LandingNav } from "@/components/landing/landing-nav";
import { API_URL } from "@/lib/api";
import { supabase } from "@/lib/supabase";

const C = {
    bg: "var(--l-bg, #1A1916)",
    raised: "var(--l-bg-raised, #211F1B)",
    text: "var(--l-text, #ECE8E0)",
    textSec: "var(--l-text-secondary, #A09A8E)",
    textTer: "var(--l-text-tertiary, #6B665C)",
    accent: "var(--l-accent, #82C0CC)",
    border: "var(--l-border, #33312B)",
    serif: 'var(--font-newsreader, "Newsreader"), Georgia, serif',
    sans: 'var(--font-dm-sans, "DM Sans"), system-ui, sans-serif',
};

export default function PricingPage() {
    const [loading, setLoading] = useState<string | null>(null);

    const handleCheckout = async (stripePriceId: string | null, tierId: string) => {
        if (!stripePriceId) return;
        setLoading(tierId);
        try {
            const {
                data: { session },
            } = await supabase.auth.getSession();
            if (!session) {
                window.location.href = "/login?redirect=/pricing";
                return;
            }
            const res = await fetch(`${API_URL}/api/stripe/create-checkout-session`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({
                    priceId: stripePriceId,
                    successUrl: `${window.location.origin}/checkout/success`,
                    cancelUrl: `${window.location.origin}/checkout/cancel`,
                }),
            });
            if (res.status === 401) {
                await supabase.auth.signOut();
                window.location.href = "/login?redirect=/pricing";
                return;
            }
            const data = await res.json();
            if (data.url) window.location.href = data.url;
        } catch (error) {
            console.error("Checkout error:", error);
        } finally {
            setLoading(null);
        }
    };

    return (
        <div className="landing" style={{ minHeight: "100dvh", background: C.bg, fontFamily: C.sans }}>
            <LandingNav />

            <main style={{ padding: "180px 48px 80px", maxWidth: 1080, margin: "0 auto" }}>
                {/* Header */}
                <div style={{ textAlign: "center", marginBottom: 48 }}>
                    <h1
                        style={{
                            fontFamily: C.serif,
                            fontSize: 44,
                            fontWeight: 400,
                            color: C.text,
                            letterSpacing: "-0.02em",
                            lineHeight: 1.2,
                            margin: "0 0 14px",
                        }}
                    >
                        Your focus is priceless.
                    </h1>
                    <p style={{ fontSize: 16, color: C.textSec, lineHeight: 1.6, margin: 0 }}>Start free, upgrade when you need more.</p>
                </div>

                {/* Cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 64 }}>
                    {PRICING_TIERS.map((tier) => {
                        const regionPrice = tier.pricing.global;
                        const isHighlighted = tier.highlighted;

                        return (
                            <div
                                key={tier.id}
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    padding: "32px 28px",
                                    borderRadius: 16,
                                    background: C.raised,
                                    border: isHighlighted ? "1px solid rgba(130, 192, 204, 0.2)" : `1px solid ${C.border}`,
                                    position: "relative",
                                }}
                            >
                                {isHighlighted && (
                                    <span
                                        style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 6,
                                            fontSize: 10,
                                            fontWeight: 500,
                                            color: C.accent,
                                            textTransform: "uppercase",
                                            letterSpacing: "0.09em",
                                            marginBottom: 16,
                                        }}
                                    >
                                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.accent }} />
                                        Most Popular
                                    </span>
                                )}

                                <span
                                    style={{
                                        fontSize: 10,
                                        fontWeight: 600,
                                        color: isHighlighted ? C.accent : C.textTer,
                                        textTransform: "uppercase",
                                        letterSpacing: "0.09em",
                                        marginBottom: 12,
                                    }}
                                >
                                    {tier.name}
                                </span>

                                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 6 }}>
                                    <span style={{ fontFamily: C.serif, fontSize: 40, fontWeight: 300, color: C.text, letterSpacing: -2, lineHeight: 1 }}>
                                        {regionPrice.displayPrice}
                                    </span>
                                    {regionPrice.period && <span style={{ fontSize: 13, color: C.textTer }}>{regionPrice.period}</span>}
                                </div>

                                <p style={{ fontSize: 13, color: C.textSec, margin: "0 0 24px", lineHeight: 1.5 }}>{tier.description}</p>

                                {/* CTA */}
                                {tier.contactSales ? (
                                    <a
                                        href="/contact"
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            padding: "11px 0",
                                            borderRadius: 10,
                                            fontSize: 14,
                                            fontWeight: 500,
                                            textDecoration: "none",
                                            marginBottom: 24,
                                            color: C.text,
                                            border: `1px solid ${C.border}`,
                                            background: "transparent",
                                            transition: "border-color 0.15s",
                                        }}
                                    >
                                        {tier.cta}
                                    </a>
                                ) : (
                                    <button
                                        onClick={() =>
                                            regionPrice.stripePriceId
                                                ? handleCheckout(regionPrice.stripePriceId, tier.id)
                                                : (window.location.href = "/download")
                                        }
                                        disabled={loading === tier.id}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            padding: "11px 0",
                                            borderRadius: 10,
                                            fontSize: 14,
                                            fontWeight: 500,
                                            cursor: "pointer",
                                            marginBottom: 24,
                                            color: isHighlighted ? "#1A1916" : C.text,
                                            background: isHighlighted ? C.text : "transparent",
                                            border: isHighlighted ? "none" : `1px solid ${C.border}`,
                                            transition: "opacity 0.15s",
                                            width: "100%",
                                        }}
                                    >
                                        {loading === tier.id ? "Redirecting..." : tier.cta}
                                    </button>
                                )}

                                <div style={{ height: 1, background: `rgba(236, 232, 224, 0.04)`, marginBottom: 20 }} />

                                {/* Features */}
                                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
                                    {tier.features.map((feature) => (
                                        <li key={feature} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                            <div
                                                style={{
                                                    width: 18,
                                                    height: 18,
                                                    borderRadius: "50%",
                                                    background: isHighlighted ? "rgba(130, 192, 204, 0.12)" : `rgba(236, 232, 224, 0.04)`,
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    flexShrink: 0,
                                                    marginTop: 1,
                                                }}
                                            >
                                                <svg
                                                    width="10"
                                                    height="10"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke={isHighlighted ? C.accent : C.textTer}
                                                    strokeWidth="3"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                >
                                                    <path d="M20 6L9 17l-5-5" />
                                                </svg>
                                            </div>
                                            <span style={{ fontSize: 13, color: C.textSec, lineHeight: 1.45 }}>{feature}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        );
                    })}
                </div>
            </main>

            <LandingFooter />
        </div>
    );
}
