"use client";

import { useEffect, useRef } from "react";

const C = {
    bgRaised: "var(--l-bg-raised, #211F1B)",
    borderSubtle: "var(--l-border-subtle, #2A2824)",
    accent: "var(--l-accent, #82C0CC)",
    text: "var(--l-text, #ECE8E0)",
    textSec: "var(--l-text-secondary, #A09A8E)",
    serif: 'var(--font-newsreader, "Newsreader"), Georgia, serif',
    sans: 'var(--font-dm-sans, "DM Sans"), system-ui, sans-serif',
};

const cards = [
    {
        title: "Replace the management cycle",
        description: "When you already know what's going on, meetings can be about strategy and decisions — not status updates.",
    },
    {
        title: "Merit-based recognition",
        description: "Mitable makes every person's work visible, so the best work always gets recognised — not just the work of those who speak up loudest.",
    },
    {
        title: "Scale without the overhead",
        description:
            "Mitable removes the context-switching tax that limits how many people you can effectively manage, so leading a team of 50 feels like leading a team of 5.",
    },
];

const Card = ({ title, description, delay }: { title: string; description: string; delay: number }) => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            ([e]) => {
                if (e.isIntersecting) {
                    el.style.opacity = "1";
                    el.style.transform = "translateY(0)";
                }
            },
            { threshold: 0.15 },
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    return (
        <div
            ref={ref}
            className="l-card"
            style={{
                background: C.bgRaised,
                border: `1px solid ${C.borderSubtle}`,
                borderRadius: 12,
                padding: 30,
                transition: "all 0.7s ease",
                transitionDelay: `${delay}s`,
                opacity: 0,
                transform: "translateY(28px)",
                cursor: "default",
            }}
            onMouseEnter={(e) => {
                const t = e.currentTarget;
                t.style.borderColor = C.accent;
                t.style.boxShadow = `0 0 0 1px ${C.accent}`;
            }}
            onMouseLeave={(e) => {
                const t = e.currentTarget;
                t.style.borderColor = C.borderSubtle;
                t.style.boxShadow = "none";
            }}
        >
            <h3
                style={{
                    fontFamily: C.serif,
                    fontSize: 19,
                    fontWeight: 400,
                    color: C.text,
                    marginBottom: 10,
                    margin: "0 0 10px 0",
                }}
            >
                {title}
            </h3>
            <p
                style={{
                    fontSize: 14,
                    color: C.textSec,
                    lineHeight: 1.65,
                    margin: 0,
                    fontFamily: C.sans,
                }}
            >
                {description}
            </p>
        </div>
    );
};

export const CardsSection = () => (
    <section
        className="l-cards-section"
        style={{
            padding: "120px 48px",
            maxWidth: 1240,
            margin: "0 auto",
            fontFamily: C.sans,
        }}
    >
        <h2
            style={{
                fontFamily: C.serif,
                fontSize: 30,
                fontWeight: 400,
                color: C.text,
                marginBottom: 44,
                letterSpacing: "-0.01em",
                margin: "0 0 44px 0",
            }}
        >
            Built for teams of the future
        </h2>
        <div
            className="l-cards-grid"
            style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 18,
            }}
        >
            {cards.map((card, i) => (
                <Card key={card.title} {...card} delay={i * 0.08} />
            ))}
        </div>
    </section>
);
