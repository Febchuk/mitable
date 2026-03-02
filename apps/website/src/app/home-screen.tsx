"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CTASection, FeaturesSection, Footer, HeroSection, PricingSection, PrivacySection, TimelineSection } from "@/components/landing";
import { MitableHeader } from "@/components/marketing/header-navigation/mitable-header";
import { supabase } from "@/lib/supabase";

// import { UseCasesSection } from "@/components/landing/use-cases-section";

export const HomeScreen = () => {
    const router = useRouter();
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                router.replace("/billing");
            } else {
                setChecking(false);
            }
        });
    }, [router]);

    if (checking) {
        return (
            <div className="flex min-h-dvh items-center justify-center bg-ink">
                <div className="size-8 animate-spin rounded-full border-2 border-gray-700 border-t-brand-500" />
            </div>
        );
    }

    return (
        <div className="flex min-h-dvh flex-col bg-ink">
            {/* Header */}
            <MitableHeader />

            {/* Main content - pt accounts for fixed header */}
            <main className="flex-1 pt-18 md:pt-20">
                {/* Hero Section - "Work in the flow. Leave the receipts to us." */}
                <HeroSection />

                {/* Flow Comparison - "Context switching kills momentum" */}
                {/* <FlowComparisonSection /> */}

                {/* Use Cases Section - "Built for makers" */}
                {/* <UseCasesSection /> */}

                {/* Features Section - Sessions, Docs, To-Dos */}
                <FeaturesSection />

                {/* Timeline Section - "Perfect Memory. Zero Effort." */}
                <TimelineSection />

                {/* Privacy Section - "Private by design" */}
                <PrivacySection />

                {/* Pricing Section - "Invest in your attention span" */}
                <PricingSection />

                {/* CTA Section - "Your work, documented automatically" */}
                <CTASection />
            </main>

            {/* Footer */}
            <Footer />
        </div>
    );
};
