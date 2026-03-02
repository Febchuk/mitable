"use client";

import { useEffect, useState } from "react";
import { PRICING_TIERS, type PricingRegion } from "@mitable/shared";
import { Check as CheckIcon } from "@untitledui/icons";
import { motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { MitableHeader } from "@/components/marketing/header-navigation/mitable-header";
import { API_URL } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { cx } from "@/utils/cx";

// Cast to fix React 19 type compat with @untitledui/icons
const Check = CheckIcon as React.FC<{ className?: string }>;

type DisplayRegion = "US/AUS" | "Nigeria";

const displayRegionToPricing: Record<DisplayRegion, PricingRegion> = {
    "US/AUS": "global",
    Nigeria: "ng",
};

function detectRegion(): DisplayRegion {
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
        if (tz.includes("Lagos") || tz.includes("Africa")) return "Nigeria";
    } catch {
        // ignore
    }
    return "US/AUS";
}

function getRegionCookie(): DisplayRegion | null {
    if (typeof document === "undefined") return null;
    const match = document.cookie.match(/(?:^|;\s*)mitable-region=(\w+)/);
    if (match) {
        const val = match[1];
        if (val === "US/AUS" || val === "Nigeria") return val;
    }
    return null;
}

function setRegionCookie(region: DisplayRegion) {
    if (typeof document === "undefined") return;
    document.cookie = `mitable-region=${region};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
}

export default function PricingPage() {
    const [region, setRegion] = useState<DisplayRegion>("US/AUS");
    const [loading, setLoading] = useState<string | null>(null);

    useEffect(() => {
        const saved = getRegionCookie();
        if (saved) {
            setRegion(saved);
        } else {
            const detected = detectRegion();
            setRegion(detected);
            setRegionCookie(detected);
        }
    }, []);

    const handleRegionToggle = (r: DisplayRegion) => {
        setRegion(r);
        setRegionCookie(r);
    };

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
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.access_token}`,
                },
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
            if (data.url) {
                window.location.href = data.url;
            }
        } catch (error) {
            console.error("Checkout error:", error);
        } finally {
            setLoading(null);
        }
    };

    const pricingRegion = displayRegionToPricing[region];

    return (
        <div className="flex min-h-dvh flex-col bg-ink">
            <MitableHeader />

            <main className="flex-1 pt-18 md:pt-20">
                <section className="relative overflow-hidden">
                    {/* Background glow */}
                    <div
                        className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2"
                        style={{
                            width: "800px",
                            height: "600px",
                            background: "radial-gradient(50% 50% at 50% 50%, rgba(138,97,247,0.06) 0%, transparent 100%)",
                        }}
                    />

                    <div className="relative mx-auto max-w-container px-4 py-20 md:px-8 md:py-28 lg:py-32">
                        {/* Section header */}
                        <div className="mb-14 text-center md:mb-20">
                            <motion.p
                                className="mb-4 font-mono text-xs tracking-widest text-brand-400 uppercase"
                                initial={{ opacity: 0, y: 12 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5 }}
                            >
                                Pricing
                            </motion.p>
                            <motion.h1
                                className="mb-5 font-display text-4xl font-extrabold tracking-tight text-white uppercase md:text-5xl lg:text-6xl"
                                initial={{ opacity: 0, y: 16 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, delay: 0.1 }}
                            >
                                Your focus is priceless.
                            </motion.h1>
                            <motion.p
                                className="mx-auto max-w-xl text-lg text-gray-400"
                                initial={{ opacity: 0, y: 16 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, delay: 0.15 }}
                            >
                                Start free, upgrade when you need more.
                            </motion.p>

                            {/* Region toggle */}
                            <motion.div
                                className="mt-8 flex items-center justify-center"
                                initial={{ opacity: 0, y: 12 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, delay: 0.2 }}
                            >
                                <div className="inline-flex items-center rounded-full border border-gray-800/60 bg-gray-900/50 p-1">
                                    {(["US/AUS", "Nigeria"] as const).map((r) => (
                                        <button
                                            key={r}
                                            onClick={() => handleRegionToggle(r)}
                                            className={cx(
                                                "rounded-full px-5 py-2 font-mono text-xs font-medium tracking-wider uppercase transition-all duration-200",
                                                region === r ? "bg-brand-600 text-white shadow-sm" : "text-gray-400 hover:text-white",
                                            )}
                                        >
                                            {r}
                                        </button>
                                    ))}
                                </div>
                            </motion.div>
                        </div>

                        {/* Pricing cards */}
                        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3 lg:gap-8">
                            {PRICING_TIERS.map((tier, index) => {
                                const regionPrice = tier.pricing[pricingRegion];
                                return (
                                    <motion.div
                                        key={tier.id}
                                        className={cx(
                                            "relative flex flex-col overflow-hidden rounded-2xl border p-6 transition-all duration-300 md:p-8",
                                            tier.highlighted
                                                ? "border-brand-500/40 bg-brand-950/20 shadow-[0_0_40px_rgba(138,97,247,0.08)]"
                                                : "border-gray-800/60 bg-gray-900/30 hover:border-gray-700/60",
                                        )}
                                        initial={{ opacity: 0, y: 20 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
                                    >
                                        {tier.highlighted && (
                                            <div className="absolute -top-px right-0 left-0 h-px bg-gradient-to-r from-transparent via-brand-400 to-transparent" />
                                        )}

                                        {tier.highlighted && (
                                            <span className="mb-5 inline-flex w-fit items-center gap-1.5 rounded-full bg-brand-900/40 px-3 py-1 font-mono text-[10px] tracking-widest text-brand-400 uppercase">
                                                <span className="size-1.5 rounded-full bg-brand-400" />
                                                Most Popular
                                            </span>
                                        )}

                                        <h3 className="mb-2 font-mono text-xs font-semibold tracking-widest text-brand-400 uppercase">{tier.name}</h3>

                                        <div className="mb-1 flex items-baseline gap-1">
                                            <span className="font-display text-4xl font-extrabold tracking-tight text-white">{regionPrice.displayPrice}</span>
                                            {regionPrice.period && <span className="font-mono text-sm text-gray-500">{regionPrice.period}</span>}
                                        </div>

                                        <p className="mb-6 text-sm text-gray-500">{tier.description}</p>

                                        {tier.contactSales ? (
                                            <Button color="secondary" size="lg" className="btn-pill mb-7 w-full" href="/contact">
                                                {tier.cta}
                                            </Button>
                                        ) : regionPrice.stripePriceId ? (
                                            <Button
                                                color={tier.highlighted ? "primary" : "secondary"}
                                                size="lg"
                                                className="btn-pill mb-7 w-full"
                                                onClick={() => handleCheckout(regionPrice.stripePriceId, tier.id)}
                                                isDisabled={loading === tier.id}
                                            >
                                                {loading === tier.id ? "Redirecting..." : tier.cta}
                                            </Button>
                                        ) : (
                                            <Button
                                                color={tier.highlighted ? "primary" : "secondary"}
                                                size="lg"
                                                className="btn-pill mb-7 w-full"
                                                href="/download"
                                            >
                                                {tier.cta}
                                            </Button>
                                        )}

                                        <div className="mb-6 h-px bg-gray-800/40" />

                                        <ul className="flex flex-1 flex-col gap-3">
                                            {tier.features.map((feature) => (
                                                <li key={feature} className="flex items-start gap-3">
                                                    <div
                                                        className={cx(
                                                            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                                                            tier.highlighted ? "bg-brand-900/40" : "bg-gray-800/60",
                                                        )}
                                                    >
                                                        <Check className={cx("size-3", tier.highlighted ? "text-brand-400" : "text-gray-500")} />
                                                    </div>
                                                    <span className="text-sm text-gray-300">{feature}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
