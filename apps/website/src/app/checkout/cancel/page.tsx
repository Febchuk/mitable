"use client";

import { motion } from "motion/react";
import { Button } from "@/components/base/buttons/button";
import { MitableHeader } from "@/components/marketing/header-navigation/mitable-header";

export default function CheckoutCancelPage() {
    return (
        <div className="flex min-h-dvh flex-col bg-ink">
            <MitableHeader />

            <main className="flex flex-1 items-center justify-center pt-18 md:pt-20">
                <div className="mx-auto max-w-lg px-4 py-20 text-center md:px-8">
                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
                        <h1 className="mb-3 font-display text-3xl font-extrabold tracking-tight text-white uppercase md:text-4xl">Checkout cancelled</h1>
                        <p className="mb-8 text-lg text-gray-400">No worries — you can upgrade anytime. Your free plan is still active.</p>

                        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                            <Button color="primary" size="lg" className="btn-pill" href="/pricing">
                                View Plans
                            </Button>
                            <Button color="secondary" size="lg" className="btn-pill" href="/">
                                Back to Home
                            </Button>
                        </div>
                    </motion.div>
                </div>
            </main>
        </div>
    );
}
