"use client";

import { ClosingCtaSection, LandingFooter } from "@/components/landing";
import { AboutTeamSection } from "@/components/landing/about-team-section";
import { LandingNav } from "@/components/landing/landing-nav";

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

export default function AboutPage() {
    return (
        <div className="landing" style={{ minHeight: "100dvh", background: C.bg, fontFamily: C.sans }}>
            <style>{`
                .about-hero {
                    padding: 200px 48px 60px;
                    text-align: center;
                    max-width: 1100px;
                    margin: 0 auto;
                }
                .about-hero h1 {
                    font-family: ${C.serif};
                    font-size: 48px;
                    font-weight: 400;
                    color: ${C.text};
                    letter-spacing: -0.02em;
                    line-height: 1.22;
                    margin: 0 auto 22px;
                    max-width: 760px;
                    text-wrap: balance;
                }
                .about-hero p {
                    font-size: 17px;
                    color: ${C.textSec};
                    line-height: 1.65;
                    margin: 0 auto 44px;
                    max-width: 560px;
                }

                .about-section {
                    padding: 60px 32px;
                    max-width: 800px;
                    margin: 0 auto;
                    text-align: center;
                }
                .about-section h2 {
                    font-family: ${C.serif};
                    font-size: 40px;
                    font-weight: 400;
                    color: ${C.text};
                    letter-spacing: -0.02em;
                    margin: 0 0 24px;
                    line-height: 1.2;
                }
                .about-section p {
                    font-size: 18px;
                    color: ${C.textSec};
                    line-height: 1.7;
                    margin: 0;
                }

                .about-closing {
                    padding: 100px 32px;
                    max-width: 800px;
                    margin: 0 auto;
                    text-align: center;
                }
                .about-closing p {
                    font-size: 24px;
                    color: ${C.text};
                    line-height: 1.5;
                    margin: 0;
                }

                .about-team {
                    padding: 80px 32px 120px;
                    max-width: 1120px;
                    margin: 0 auto;
                }
                .about-team h2 {
                    text-align: center;
                    font-family: ${C.serif};
                    font-size: 40px;
                    font-weight: 400;
                    color: ${C.text};
                    margin: 0 0 48px;
                }
                .about-team-rows {
                    display: flex;
                    flex-direction: column;
                    gap: 28px;
                }
                .about-team-row {
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: center;
                    gap: 24px;
                }
                .team-card {
                    background: var(--l-bg-overlay, #2A2824);
                    border: 1px solid ${C.border};
                    border-radius: 16px;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    flex: 0 1 280px;
                    max-width: 300px;
                    width: 100%;
                }
                .team-card-visual {
                    padding: 10px 10px 0;
                }
                .team-card-img {
                    width: 100%;
                    aspect-ratio: 3 / 4;
                    object-fit: cover;
                    object-position: center top;
                    border-radius: 10px;
                    background: ${C.border};
                    display: block;
                }
                .team-card-content {
                    padding: 16px 16px 18px;
                }
                .team-card-head {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: 8px;
                    margin-bottom: 6px;
                }
                .team-name {
                    font-size: 17px;
                    font-weight: 600;
                    color: ${C.text};
                    margin: 0 0 2px;
                    line-height: 1.25;
                }
                .team-role {
                    font-size: 10px;
                    color: ${C.accent};
                    font-weight: 600;
                    letter-spacing: 0.1em;
                    text-transform: uppercase;
                    margin: 0;
                }
                .team-linkedin {
                    flex-shrink: 0;
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: ${C.textTer};
                    background: rgba(var(--l-ui-rgb, 236, 232, 224), 0.06);
                    transition: color 0.15s ease, background 0.15s ease;
                }
                .team-linkedin:hover {
                    color: ${C.textSec};
                    background: rgba(var(--l-ui-rgb, 236, 232, 224), 0.1);
                }
                .team-previous-line {
                    font-size: 13px;
                    line-height: 1.45;
                    color: ${C.textSec};
                    margin: 0 0 14px;
                }
                .team-logo-row {
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                    gap: 10px;
                }
                .team-logo-link {
                    width: 42px;
                    height: 42px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                    background: rgba(var(--l-ui-rgb, 236, 232, 224), 0.07);
                    border: 1px solid rgba(var(--l-ui-rgb, 236, 232, 224), 0.1);
                    color: ${C.textSec};
                    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
                }
                .team-logo-link:hover {
                    background: rgba(var(--l-ui-rgb, 236, 232, 224), 0.11);
                    border-color: rgba(var(--l-ui-rgb, 236, 232, 224), 0.16);
                    color: ${C.text};
                }
                .team-logo-link-inner {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    height: 100%;
                }
                .team-logo-link-inner svg {
                    width: 55%;
                    height: 55%;
                }

                @media (max-width: 768px) {
                    .about-hero {
                        padding: 100px 20px 24px;
                        text-align: left;
                    }
                    .about-hero h1 {
                        font-size: 32px;
                        max-width: none;
                    }
                    .about-hero p {
                        font-size: 15px;
                        max-width: none;
                    }
                    .about-section {
                        padding: 24px 20px;
                        text-align: left;
                    }
                    .about-section h2, .about-team h2 {
                        font-size: 26px;
                    }
                    .about-team {
                        padding: 48px 20px 80px;
                    }
                    .about-team h2 {
                        margin-bottom: 32px;
                    }
                    .team-card {
                        max-width: none;
                        flex: 1 1 auto;
                    }
                    .about-team-row {
                        flex-direction: column;
                        align-items: stretch;
                        gap: 20px;
                    }
                    .team-card-visual {
                        padding: 12px 12px 0;
                    }
                    .team-card-img {
                        aspect-ratio: 4 / 5;
                        object-position: center center;
                        border-radius: 14px;
                    }
                    .team-card-content {
                        padding: 18px 20px 22px;
                    }
                    .team-previous-line {
                        font-size: 14px;
                        margin-bottom: 16px;
                    }
                    .team-logo-link {
                        width: 48px;
                        height: 48px;
                    }
                    .team-logo-link-inner {
                        width: 36px;
                        height: 36px;
                    }
                    .about-section p {
                        font-size: 15px;
                    }
                    .about-closing {
                        padding: 24px 20px;
                        text-align: left;
                    }
                    .about-closing p {
                        font-size: 17px;
                    }
                }
            `}</style>
            <LandingNav />

            <main>
                {/* Hero Section */}
                <section className="about-hero">
                    <h1>
                        Managing people is one of the <strong style={{ fontWeight: 600 }}>hardest</strong> jobs in a company.
                        <br />
                        <em style={{ fontStyle: "italic", color: C.accent }}>
                            {" "}
                            We think it should be <strong style={{ fontWeight: 600 }}>easier</strong>.
                        </em>
                    </h1>
                    <p>
                        AI has transformed how engineers, PMs, and ops teams work. Managers are still doing their work manually — gathering context from their
                        team, chasing updates, trying to form a complete picture, and then translating all of it upward to leadership. We built Mitable to fix
                        that.
                    </p>
                </section>

                {/* Section 2 */}
                <section className="about-section">
                    <h2>Great teams don't happen by accident. They need clarity.</h2>
                    <p>
                        When managers know what their team is actually working on — and can measure it against clear benchmarks — misalignment gets caught
                        early, strong work gets recognised, and people understand what good looks like. That's not micromanagement. That's just good leadership,
                        with the right information to back it up.
                    </p>
                </section>

                {/* Section 3 */}
                <section className="about-section">
                    <h2>We didn't want to build something that only worked for one side of the table.</h2>
                    <p>
                        Employees deserve to know how they're being evaluated and to get credit for the work they're putting in. Mitable gives every employee a
                        score against the benchmarks their manager has set, and a Bragbook that captures their contributions automatically. When both sides are
                        working from the same picture, performance stops being something that happens to you and starts being something you're part of.
                    </p>
                </section>

                {/* Section 4 */}
                <section className="about-closing">
                    <p>We've been managers. We've been managed. We started Mitable because both sides deserve better than the way things work today.</p>
                </section>

                <AboutTeamSection />

                <ClosingCtaSection />
            </main>

            <LandingFooter />
        </div>
    );
}
