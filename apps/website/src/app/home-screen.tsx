"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    HeroSection,
    SocialProofSection,
    FeatureSection,
    CardsSection,
    ClosingCtaSection,
    LandingNav,
    LandingFooter,
} from "@/components/landing";
import { BenchmarkMockup } from "@/components/landing/mockups/benchmark-mockup";
import { WorkMontageMockup } from "@/components/landing/mockups/work-montage-mockup";
import { EvaluationMockup } from "@/components/landing/mockups/evaluation-mockup";
import { PersonDetailMockup } from "@/components/landing/mockups/person-detail-mockup";
import { supabase } from "@/lib/supabase";

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
            <div
                className="landing"
                style={{
                    display: "flex",
                    minHeight: "100dvh",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--l-bg, #1A1916)",
                }}
            >
                <div className="l-spinner" />
            </div>
        );
    }

    return (
        <div className="landing" style={{ minHeight: "100dvh", background: "var(--l-bg, #1A1916)" }}>
            <LandingNav />

            <main>
                <HeroSection />

                <SocialProofSection />

                {/* Feature 1: Benchmarks */}
                <FeatureSection
                    title="Set the standard."
                    description="Define what good looks like for every role. Mitable's AI generates scoring parameters from a simple description, so benchmarks take minutes to create — not days."
                    linkText="Learn how benchmarks work →"
                    mockup={<BenchmarkMockup />}
                />

                {/* Feature 2: Multi-app work montage */}
                <FeatureSection
                    title="Your team just works."
                    description="Slack, browsers, terminals, docs — Mitable captures work across every app on your team's computer. No manual time tracking. No status updates. Just work."
                    linkText="See how capture works →"
                    mockup={<WorkMontageMockup />}
                    rawMockup
                    reverse
                />

                {/* Feature 3: Evaluation */}
                <FeatureSection
                    title="Evaluate performance more accurately."
                    description="Get a live, AI-generated score for every person on your team — measured against the benchmarks you set. No more guessing who's on track and who needs support."
                    linkText="See the employee view →"
                    mockup={<EvaluationMockup />}
                />

                {/* Feature 4: Person Detail */}
                <FeatureSection
                    title="More robust reporting."
                    description="See exactly how each person spends their time — which customers they serve, how their focus and meeting hours break down, and where they're most effective."
                    linkText="See the full dashboard →"
                    mockup={<PersonDetailMockup />}
                    reverse
                />

                <CardsSection />

                <ClosingCtaSection />
            </main>

            <LandingFooter />
        </div>
    );
};
