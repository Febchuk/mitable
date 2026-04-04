"use client";

import { ClosingCtaSection, LandingFooter } from "@/components/landing";
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

/* Leadership team — restore with section below in a later commit.
const TEAM_MEMBERS = [
    {
        name: "Mikun Adeniran",
        role: "Founder",
        companies: ["Microsoft", "AWS"],
        image: "https://ui-avatars.com/api/?name=Mikun+Adeniran&background=random&color=fff&size=400"
    },
    {
        name: "Jason Smith",
        role: "Founding Engineer",
        companies: ["Stripe", "Vercel"],
        image: "https://ui-avatars.com/api/?name=Jason+Smith&background=random&color=fff&size=400"
    },
    {
        name: "Sarah Chen",
        role: "Head of Product",
        companies: ["Figma", "Linear"],
        image: "https://ui-avatars.com/api/?name=Sarah+Chen&background=random&color=fff&size=400"
    }
];
*/

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
                    max-width: 1100px;
                    margin: 0 auto;
                }
                .about-team h2 {
                    text-align: center;
                    font-family: ${C.serif};
                    font-size: 40px;
                    font-weight: 400;
                    color: ${C.text};
                    margin: 0 0 64px;
                }
                .team-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 32px;
                }
                .team-card {
                    background: ${C.raised};
                    border: 1px solid ${C.border};
                    border-radius: 16px;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }
                .team-card-img {
                    width: 100%;
                    aspect-ratio: 1 / 1;
                    object-fit: cover;
                    background: ${C.border};
                }
                .team-card-content {
                    padding: 24px;
                }
                .team-name {
                    font-size: 20px;
                    font-weight: 600;
                    color: ${C.text};
                    margin: 0 0 4px;
                }
                .team-role {
                    font-size: 14px;
                    color: ${C.accent};
                    font-weight: 500;
                    margin: 0 0 20px;
                }
                .team-prev-label {
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: ${C.textTer};
                    margin: 0 0 12px;
                    font-weight: 600;
                }
                .team-companies {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 12px;
                    align-items: center;
                }
                .company-logo-text {
                    font-size: 14px;
                    font-weight: 700;
                    color: ${C.textSec};
                    letter-spacing: -0.02em;
                    opacity: 0.8;
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

                {/* Leadership Team — uncomment TEAM_MEMBERS + this block in a later commit.
                <section className="about-team">
                    <h2>Leadership Team</h2>
                    <div className="team-grid">
                        {TEAM_MEMBERS.map((member) => (
                            <div key={member.name} className="team-card">
                                <img src={member.image} alt={member.name} className="team-card-img" />
                                <div className="team-card-content">
                                    <h3 className="team-name">{member.name}</h3>
                                    <p className="team-role">{member.role}</p>

                                    <div className="team-prev-label">Previously</div>
                                    <div className="team-companies">
                                        {member.companies.map((company) => (
                                            <span key={company} className="company-logo-text">
                                                {company}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
                */}

                <ClosingCtaSection />
            </main>

            <LandingFooter />
        </div>
    );
}
