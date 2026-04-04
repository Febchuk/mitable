"use client";

import type { PrevCompanyId } from "./about-team-logos";
import { PrevCompanyLogoMark } from "./about-team-logos";

type PrevCompany = { label: string; url: string; logoId: PrevCompanyId };

type TeamMember = {
    name: string;
    role: string;
    image: string;
    linkedinUrl?: string;
    previous: PrevCompany[];
};

const ROW_1: TeamMember[] = [
    {
        name: "Mikun Adewole",
        role: "CEO",
        image: "/team/mikun-adewole.png",
        previous: [
            { label: "Salesforce", url: "https://www.salesforce.com", logoId: "salesforce" },
            { label: "Lorikeet", url: "https://lorikeetcx.ai", logoId: "lorikeet" },
        ],
    },
    {
        name: "Febe Chukwuma",
        role: "CTO",
        image: "/team/febe-chukwuma.png",
        previous: [
            { label: "Meta", url: "https://www.meta.com", logoId: "meta" },
            { label: "Apple", url: "https://www.apple.com", logoId: "apple" },
            { label: "Salesforce", url: "https://www.salesforce.com", logoId: "salesforce" },
        ],
    },
    {
        name: "Aurel Npounengnong",
        role: "Founding Engineer",
        image: "/team/aurel-npounengnong.png",
        previous: [{ label: "Leidos", url: "https://www.leidos.com", logoId: "leidos" }],
    },
];

const ROW_2: TeamMember[] = [
    {
        name: "Ella Mgbudem",
        role: "Product Manager",
        image: "/team/ella-mgbudem.png",
        previous: [
            { label: "EY", url: "https://www.ey.com", logoId: "ey" },
            { label: "KPMG", url: "https://www.kpmg.com", logoId: "kpmg" },
            { label: "Macquarie", url: "https://www.macquarie.com", logoId: "macquarie" },
        ],
    },
    {
        name: "Kamsi Chukwuma",
        role: "Product Manager",
        image: "/team/kamsi-chukwuma.png",
        previous: [
            { label: "Oracle", url: "https://www.oracle.com", logoId: "oracle" },
            { label: "RippleMatch", url: "https://www.ripplematch.com", logoId: "ripplematch" },
        ],
    },
];

function TeamCard({ member }: { member: TeamMember }) {
    const previousLabels = member.previous.map((p) => p.label).join(", ");

    return (
        <article className="team-card">
            <div className="team-card-visual">
                <img src={member.image} alt={member.name} className="team-card-img" loading="lazy" />
            </div>
            <div className="team-card-content">
                <div className="team-card-head">
                    <div>
                        <h3 className="team-name">{member.name}</h3>
                        <p className="team-role">{member.role}</p>
                    </div>
                    {member.linkedinUrl ? (
                        <a
                            href={member.linkedinUrl}
                            className="team-linkedin"
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`${member.name} on LinkedIn`}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                            </svg>
                        </a>
                    ) : null}
                </div>
                <p className="team-previous-line">Previously: {previousLabels}</p>
                <div className="team-logo-row">
                    {member.previous.map((co) => (
                        <a
                            key={co.label + co.url}
                            href={co.url}
                            className="team-logo-link"
                            target="_blank"
                            rel="noopener noreferrer"
                            title={co.label}
                            aria-label={`${co.label} (opens in new tab)`}
                        >
                            <span className="team-logo-link-inner">
                                <PrevCompanyLogoMark id={co.logoId} />
                            </span>
                        </a>
                    ))}
                </div>
            </div>
        </article>
    );
}

export function AboutTeamSection() {
    return (
        <section className="about-team">
            <h2>Our Team</h2>
            <div className="about-team-rows">
                <div className="about-team-row">
                    {ROW_1.map((m) => (
                        <TeamCard key={m.name} member={m} />
                    ))}
                </div>
                <div className="about-team-row">
                    {ROW_2.map((m) => (
                        <TeamCard key={m.name} member={m} />
                    ))}
                </div>
            </div>
        </section>
    );
}
