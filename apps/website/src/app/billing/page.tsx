"use client";

import { useEffect, useState } from "react";
import { PRICING_TIERS, type QuotaStatus, type SubscriptionResponse } from "@mitable/shared";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingFooter } from "@/components/landing";
import { API_URL } from "@/lib/api";
import { supabase } from "@/lib/supabase";

const C = {
    bg: "var(--l-bg, #1A1916)",
    raised: "var(--l-bg-raised, #211F1B)",
    text: "var(--l-text, #ECE8E0)",
    textSec: "var(--l-text-secondary, #A09A8E)",
    textTer: "var(--l-text-tertiary, #6B665C)",
    textFaint: "var(--l-text-faint, #4A4640)",
    accent: "var(--l-accent, #82C0CC)",
    border: "var(--l-border, #33312B)",
    serif: 'var(--font-newsreader, "Newsreader"), Georgia, serif',
    sans: 'var(--font-dm-sans, "DM Sans"), system-ui, sans-serif',
};

const cardStyle: React.CSSProperties = {
    overflow: "hidden",
    borderRadius: 16,
    border: `1px solid ${C.border}`,
    background: C.raised,
    padding: "28px 32px",
};

const buttonPrimary: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "13px 28px",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 500,
    background: "var(--l-text, #ECE8E0)",
    color: "var(--l-bg, #1A1916)",
    border: "none",
    textDecoration: "none",
    fontFamily: 'var(--font-dm-sans, "DM Sans"), system-ui, sans-serif',
    transition: "opacity 0.15s",
    cursor: "pointer",
};

const buttonSecondary: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "13px 28px",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 500,
    background: "rgba(var(--l-ui-rgb, 236,232,224), 0.06)",
    color: "var(--l-text, #ECE8E0)",
    border: "1px solid rgba(var(--l-ui-rgb, 236,232,224), 0.08)",
    textDecoration: "none",
    fontFamily: 'var(--font-dm-sans, "DM Sans"), system-ui, sans-serif',
    transition: "opacity 0.15s",
    cursor: "pointer",
};

interface BillingData {
    subscription: SubscriptionResponse | null;
    quota: QuotaStatus | null;
}

function UsageBar({ label, used, limit, percent }: { label: string; used: number; limit: number | null; percent: number }) {
    const barColor = percent > 90 ? "var(--status-error, #E87474)" : percent > 70 ? "var(--status-warning, #D4A27A)" : "var(--l-accent, #82C0CC)";

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: C.textSec }}>{label}</span>
                <span style={{ fontFamily: C.sans, color: C.textSec, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                    {used.toLocaleString()} / {limit === null ? "Unlimited" : limit.toLocaleString()}
                </span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "rgba(var(--l-ui-rgb, 236,232,224), 0.06)", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 3, background: barColor, transition: "width 0.5s", width: `${Math.min(percent, 100)}%` }} />
            </div>
        </div>
    );
}

function statusBadgeStyle(status: string): React.CSSProperties {
    const colorMap: Record<string, { bg: string; text: string }> = {
        active: { bg: "rgba(58,155,107,0.15)", text: "var(--status-success, #3A9B6B)" },
        trialing: { bg: "rgba(130,192,204,0.15)", text: "var(--l-accent, #82C0CC)" },
        past_due: { bg: "rgba(212,162,122,0.15)", text: "var(--status-warning, #D4A27A)" },
    };
    const c = colorMap[status] || { bg: "rgba(232,116,116,0.15)", text: "var(--status-error, #E87474)" };
    return {
        display: "inline-block",
        padding: "4px 12px",
        borderRadius: 100,
        fontFamily: C.sans,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        background: c.bg,
        color: c.text,
    };
}

export default function BillingPage() {
    const router = useRouter();
    const [data, setData] = useState<BillingData>({ subscription: null, quota: null });
    const [loading, setLoading] = useState(true);
    const [portalLoading, setPortalLoading] = useState(false);

    useEffect(() => {
        loadBillingData();
    }, []);

    async function handleSignOut() {
        await supabase.auth.signOut();
        router.push("/");
    }

    async function getAccessToken(): Promise<string | null> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            window.location.href = "/login?redirect=/billing";
            return null;
        }
        return session.access_token;
    }

    async function loadBillingData() {
        const token = await getAccessToken();
        if (!token) return;

        try {
            const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
            const [subRes, quotaRes] = await Promise.all([
                fetch(`${API_URL}/api/billing/subscription`, { headers }),
                fetch(`${API_URL}/api/billing/quota`, { headers }),
            ]);

            if (subRes.status === 401 || quotaRes.status === 401) {
                await supabase.auth.signOut();
                window.location.href = "/login?redirect=/billing";
                return;
            }

            const subscription = subRes.ok ? await subRes.json() : null;
            const quota = quotaRes.ok ? await quotaRes.json() : null;
            setData({ subscription, quota });
        } catch (error) {
            console.error("Failed to load billing data:", error);
        } finally {
            setLoading(false);
        }
    }

    async function handleManageBilling() {
        setPortalLoading(true);
        try {
            const token = await getAccessToken();
            if (!token) return;

            const res = await fetch(`${API_URL}/api/stripe/create-portal-session`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ returnUrl: window.location.href }),
            });

            if (res.status === 401) {
                await supabase.auth.signOut();
                window.location.href = "/login?redirect=/billing";
                return;
            }

            const result = await res.json();
            if (result.url) window.location.href = result.url;
        } catch (error) {
            console.error("Failed to open billing portal:", error);
        } finally {
            setPortalLoading(false);
        }
    }

    const currentTier = data.subscription?.subscription?.tier || "free";
    const tierConfig = PRICING_TIERS.find((t) => t.id === currentTier);
    const status = data.subscription?.subscription?.status || "active";

    return (
        <div className="landing" style={{ minHeight: "100dvh", background: C.bg, fontFamily: C.sans, display: "flex", flexDirection: "column" }}>
            <LandingNav />

            <main
                className="l-account-page-main"
                style={{ flex: 1, padding: "180px 48px 80px", maxWidth: 760, margin: "0 auto", width: "100%", boxSizing: "border-box" as const }}
            >
                <div className="l-account-page-header" style={{ marginBottom: 56 }}>
                    <motion.h1
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        style={{ fontFamily: C.serif, fontSize: 44, fontWeight: 400, color: C.text, letterSpacing: "-0.02em", lineHeight: 1.2, margin: "0 0 14px" }}
                    >
                        Billing
                    </motion.h1>
                    <motion.p
                        className="l-account-page-subtitle"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        style={{ fontSize: 16, color: C.textSec, lineHeight: 1.6, margin: 0 }}
                    >
                        Manage your subscription and view usage.
                    </motion.p>
                </div>

                {loading ? (
                    <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
                        <div
                            style={{
                                width: 32,
                                height: 32,
                                border: "2px solid rgba(var(--l-ui-rgb, 236,232,224), 0.15)",
                                borderTop: `2px solid ${C.accent}`,
                                borderRadius: "50%",
                                animation: "spin 0.8s linear infinite",
                            }}
                        />
                    </div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                        {/* Current Plan */}
                        <motion.div
                            className="l-billing-card"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.15 }}
                            style={cardStyle}
                        >
                            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
                                <div>
                                    <p style={{ fontFamily: C.sans, fontSize: 10, fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase", color: C.textTer, marginBottom: 6 }}>Current Plan</p>
                                    <h2 style={{ fontFamily: C.serif, fontSize: 24, fontWeight: 400, color: C.text, margin: 0 }}>{tierConfig?.name || "Free"}</h2>
                                </div>
                                <span style={statusBadgeStyle(status)}>{status.replace("_", " ")}</span>
                            </div>

                            {data.subscription?.subscription?.currentPeriodEnd && (
                                <p style={{ fontSize: 13, color: C.textTer, marginBottom: 20 }}>
                                    {data.subscription.subscription.cancelAtPeriodEnd ? "Cancels" : "Renews"} on{" "}
                                    {new Date(data.subscription.subscription.currentPeriodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                                </p>
                            )}

                            <div style={{ display: "flex", gap: 10 }}>
                                {currentTier === "free" ? (
                                    <a
                                        href="/pricing"
                                        style={buttonPrimary}
                                        onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                                    >
                                        Upgrade
                                    </a>
                                ) : (
                                    <button
                                        onClick={handleManageBilling}
                                        disabled={portalLoading}
                                        style={{ ...buttonSecondary, opacity: portalLoading ? 0.7 : 1, cursor: portalLoading ? "wait" : "pointer" }}
                                        onMouseEnter={(e) => { if (!portalLoading) e.currentTarget.style.opacity = "0.85"; }}
                                        onMouseLeave={(e) => { if (!portalLoading) e.currentTarget.style.opacity = "1"; }}
                                    >
                                        {portalLoading ? "Loading..." : "Manage Billing"}
                                    </button>
                                )}
                            </div>
                        </motion.div>

                        {/* Usage */}
                        {data.quota && (
                            <motion.div
                                className="l-billing-card"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.25 }}
                                style={cardStyle}
                            >
                                <h2 style={{ fontFamily: C.serif, fontSize: 22, fontWeight: 400, color: C.text, margin: "0 0 20px", letterSpacing: "-0.02em" }}>Usage This Period</h2>

                                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                    <UsageBar label="AI Queries" used={data.quota.aiQueries.used} limit={data.quota.aiQueries.limit} percent={data.quota.aiQueries.percentUsed} />
                                    <UsageBar label="Documents" used={data.quota.documents.used} limit={data.quota.documents.limit} percent={data.quota.documents.percentUsed} />
                                    <UsageBar
                                        label="Storage"
                                        used={Math.round((data.quota.storage.usedBytes || 0) / 1024 / 1024)}
                                        limit={data.quota.storage.limitBytes ? Math.round(data.quota.storage.limitBytes / 1024 / 1024) : null}
                                        percent={data.quota.storage.percentUsed}
                                    />
                                </div>

                                <p style={{ marginTop: 14, fontSize: 11, color: C.textFaint }}>
                                    Period: {data.quota.periodStart} &mdash; {data.quota.periodEnd}
                                </p>
                            </motion.div>
                        )}

                        {/* Actions */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.35 }}
                            style={{ display: "flex", gap: 10 }}
                        >
                            <a
                                href="/download"
                                style={buttonPrimary}
                                onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                            >
                                Download App
                            </a>
                            <button
                                onClick={handleSignOut}
                                style={buttonSecondary}
                                onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                            >
                                Sign Out
                            </button>
                        </motion.div>
                    </div>
                )}
            </main>

            <LandingFooter />
        </div>
    );
}
