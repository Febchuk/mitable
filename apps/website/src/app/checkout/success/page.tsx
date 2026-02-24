"use client";

import { motion } from "motion/react";
import { MitableHeader } from "@/components/marketing/header-navigation/mitable-header";
import { Button } from "@/components/base/buttons/button";

export default function CheckoutSuccessPage() {
    return (
        <div className="flex min-h-dvh flex-col bg-ink">
            <MitableHeader />

            <main className="flex flex-1 items-center justify-center pt-18 md:pt-20">
                <div className="mx-auto max-w-lg px-4 py-20 text-center md:px-8">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5 }}
                    >
                        {/* Success icon */}
                        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-green-900/30">
                            <svg
                                className="size-8 text-green-400"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        </div>

                        <h1 className="mb-3 font-display text-3xl font-extrabold uppercase tracking-tight text-white md:text-4xl">
                            You&apos;re all set!
                        </h1>
                        <p className="mb-8 text-lg text-gray-400">
                            Your subscription is active. Download Mitable to start using your Pro features.
                        </p>

                        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                            <Button color="primary" size="lg" className="btn-pill" href="/download">
                                Download Mitable
                            </Button>
                            <Button color="secondary" size="lg" className="btn-pill" href="/billing">
                                View Billing
                            </Button>
                        </div>
                    </motion.div>
                </div>
            </main>
        </div>
    );
}
