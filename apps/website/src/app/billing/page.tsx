"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { PRICING_TIERS, type SubscriptionResponse, type QuotaStatus } from "@mitable/shared";
import { MitableHeader } from "@/components/marketing/header-navigation/mitable-header";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";
import { supabase } from "@/lib/supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

interface BillingData {
    subscription: SubscriptionResponse | null;
    quota: QuotaStatus | null;
}

function UsageBar({ label, used, limit, percent }: { label: string; used: number; limit: number | null; percent: number }) {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">{label}</span>
                <span className="font-mono text-gray-300">
                    {used.toLocaleString()} / {limit === null ? "Unlimited" : limit.toLocaleString()}
                </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-800/60">
                <div
                    className={cx(
                        "h-full rounded-full transition-all duration-500",
                        percent > 90 ? "bg-red-500" : percent > 70 ? "bg-yellow-500" : "bg-brand-500",
                    )}
                    style={{ width: `${Math.min(percent, 100)}%` }}
                />
            </div>
        </div>
    );
}

export default function BillingPage() {
    const [data, setData] = useState<BillingData>({ subscription: null, quota: null });
    const [loading, setLoading] = useState(true);
    const [portalLoading, setPortalLoading] = useState(false);

    useEffect(() => {
        loadBillingData();
    }, []);

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
            const headers = {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            };

            const [subRes, quotaRes] = await Promise.all([
                fetch(`${API_URL}/api/billing/subscription`, { headers }),
                fetch(`${API_URL}/api/billing/quota`, { headers }),
            ]);

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
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    returnUrl: window.location.href,
                }),
            });

            const result = await res.json();
            if (result.url) {
                window.location.href = result.url;
            }
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
        <div className="flex min-h-dvh flex-col bg-ink">
            <MitableHeader />

            <main className="flex-1 pt-18 md:pt-20">
                <section className="relative overflow-hidden">
                    <div
                        className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2"
                        style={{
                            width: "800px",
                            height: "600px",
                            background:
                                "radial-gradient(50% 50% at 50% 50%, rgba(138,97,247,0.06) 0%, transparent 100%)",
                        }}
                    />

                    <div className="relative mx-auto max-w-3xl px-4 py-20 md:px-8 md:py-28">
                        {/* Back link */}
                        <a
                            href="/"
                            className="mb-12 inline-flex items-center gap-2 font-mono text-sm text-gray-400 transition-colors hover:text-white"
                        >
                            <svg
                                className="size-4"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <line x1="19" y1="12" x2="5" y2="12" />
                                <polyline points="12 19 5 12 12 5" />
                            </svg>
                            Back to home
                        </a>

                        <motion.h1
                            className="mb-2 font-display text-3xl font-extrabold uppercase tracking-tight text-white md:text-4xl"
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5 }}
                        >
                            Billing
                        </motion.h1>
                        <motion.p
                            className="mb-12 text-gray-400"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.1 }}
                        >
                            Manage your subscription and view usage.
                        </motion.p>

                        {loading ? (
                            <div className="flex items-center justify-center py-20">
                                <div className="size-8 animate-spin rounded-full border-2 border-gray-700 border-t-brand-500" />
                            </div>
                        ) : (
                            <div className="space-y-8">
                                {/* Current Plan Card */}
                                <motion.div
                                    className="overflow-hidden rounded-2xl border border-gray-800/60 bg-gray-900/30 p-6 md:p-8"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.5, delay: 0.15 }}
                                >
                                    <div className="mb-6 flex items-start justify-between">
                                        <div>
                                            <p className="mb-1 font-mono text-xs uppercase tracking-widest text-gray-500">
                                                Current Plan
                                            </p>
                                            <h2 className="font-display text-2xl font-bold text-white">
                                                {tierConfig?.name || "Free"}
                                            </h2>
                                        </div>
                                        <span
                                            className={cx(
                                                "rounded-full px-3 py-1 font-mono text-xs uppercase tracking-wider",
                                                status === "active"
                                                    ? "bg-green-900/40 text-green-400"
                                                    : status === "trialing"
                                                      ? "bg-blue-900/40 text-blue-400"
                                                      : status === "past_due"
                                                        ? "bg-yellow-900/40 text-yellow-400"
                                                        : "bg-red-900/40 text-red-400",
                                            )}
                                        >
                                            {status.replace("_", " ")}
                                        </span>
                                    </div>

                                    {data.subscription?.subscription?.currentPeriodEnd && (
                                        <p className="mb-6 text-sm text-gray-500">
                                            {data.subscription.subscription.cancelAtPeriodEnd
                                                ? "Cancels"
                                                : "Renews"}{" "}
                                            on{" "}
                                            {new Date(data.subscription.subscription.currentPeriodEnd).toLocaleDateString(
                                                "en-US",
                                                { month: "long", day: "numeric", year: "numeric" },
                                            )}
                                        </p>
                                    )}

                                    <div className="flex gap-3">
                                        {currentTier === "free" ? (
                                            <Button color="primary" size="md" className="btn-pill" href="/pricing">
                                                Upgrade
                                            </Button>
                                        ) : (
                                            <Button
                                                color="secondary"
                                                size="md"
                                                className="btn-pill"
                                                onClick={handleManageBilling}
                                                isDisabled={portalLoading}
                                            >
                                                {portalLoading ? "Loading..." : "Manage Billing"}
                                            </Button>
                                        )}
                                    </div>
                                </motion.div>

                                {/* Usage Card */}
                                {data.quota && (
                                    <motion.div
                                        className="overflow-hidden rounded-2xl border border-gray-800/60 bg-gray-900/30 p-6 md:p-8"
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.5, delay: 0.25 }}
                                    >
                                        <h2 className="mb-6 font-display text-lg font-bold text-white">
                                            Usage This Period
                                        </h2>

                                        <div className="space-y-5">
                                            <UsageBar
                                                label="AI Queries"
                                                used={data.quota.aiQueries.used}
                                                limit={data.quota.aiQueries.limit}
                                                percent={data.quota.aiQueries.percentUsed}
                                            />
                                            <UsageBar
                                                label="Documents"
                                                used={data.quota.documents.used}
                                                limit={data.quota.documents.limit}
                                                percent={data.quota.documents.percentUsed}
                                            />
                                            <UsageBar
                                                label="Storage"
                                                used={Math.round((data.quota.storage.usedBytes || 0) / 1024 / 1024)}
                                                limit={
                                                    data.quota.storage.limitBytes
                                                        ? Math.round(data.quota.storage.limitBytes / 1024 / 1024)
                                                        : null
                                                }
                                                percent={data.quota.storage.percentUsed}
                                            />
                                        </div>

                                        <p className="mt-4 text-xs text-gray-600">
                                            Period: {data.quota.periodStart} &mdash; {data.quota.periodEnd}
                                        </p>
                                    </motion.div>
                                )}
                            </div>
                        )}
                    </div>
                </section>
            </main>
        </div>
    );
}
