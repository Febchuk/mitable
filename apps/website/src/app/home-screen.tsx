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
                {/* Hero — headline + Granola-style side-by-side mockups */}
                <HeroSection />

                {/* Social proof — logo strip */}
                <SocialProofSection />

                {/* Feature 1: Benchmarks — built component */}
                <FeatureSection
                    title="Set the standard."
                    description="Define what good looks like for every role on your team. Mitable uses those benchmarks to evaluate work as it happens, not after the quarter ends."
                    linkText="Learn how benchmarks work →"
                    mockup={<BenchmarkMockup />}
                />

                {/* Feature 2: Calendar/Activity — screenshot */}
                <FeatureSection
                    title="Get full visibility."
                    description="Mitable captures everything your team works on and surfaces what actually got done, without anyone filing a report."
                    linkText="See the work feed →"
                    screenshot="/screenshots/calendar-view.png"
                    screenshotAlt="Mitable Calendar View showing daily activity blocks and meetings"
                    reverse
                />

                {/* Feature 3: My Activity / Performance — screenshot */}
                <FeatureSection
                    title="Performance feedback, on demand."
                    description="Employees get a live view of their own performance against the benchmarks you've set. Give everyone on your team the clarity that only your top performers usually find on their own."
                    linkText="See the employee view →"
                    screenshot="/screenshots/me-view.png"
                    screenshotAlt="Mitable My Activity view showing personal performance analytics"
                />

                {/* Feature 4: Reports — screenshot */}
                <FeatureSection
                    title="More robust reporting."
                    description="Know exactly how your team's time is being spent, broken down by person and type of work. Pull it up in the dashboard or export it for deeper analysis."
                    linkText="See reports →"
                    screenshot="/screenshots/reports-view.png"
                    screenshotAlt="Mitable Weekly Work Report with executive overview"
                    reverse
                />

                {/* 3-column cards */}
                <CardsSection />

                {/* Closing CTA */}
                <ClosingCtaSection />
            </main>

            <LandingFooter />
        </div>
    );
};
