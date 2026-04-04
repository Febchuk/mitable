"use client";

import { getMockupColors, type MockupVariant } from "./colors";

const MINI_RING = 32;
const MINI_SW = 2.5;
const MINI_R = (MINI_RING - MINI_SW) / 2;
const MINI_C = 2 * Math.PI * MINI_R;

function strokeColor(score: number) {
    if (score >= 70) return `hsl(150, 45%, ${52 - ((score - 70) / 30) * 12}%)`;
    if (score >= 40) return `hsl(28, 55%, ${62 - ((70 - score) / 30) * 10}%)`;
    return `hsl(0, 55%, ${55 - ((40 - score) / 40) * 12}%)`;
}

const ScoreRing = ({ score, size, sw, r, c, C }: { score: number; size: number; sw: number; r: number; c: number; C: ReturnType<typeof getMockupColors> }) => {
    const offset = c - (score / 100) * c;
    return (
        <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
            <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`rgba(${C.uiRgb}, 0.06)`} strokeWidth={sw} />
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={strokeColor(score)} strokeWidth={sw} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: C.serif, fontSize: size > 40 ? 20 : 12, fontWeight: 400, color: C.text, lineHeight: 1 }}>{Math.round(score)}</span>
            </div>
        </div>
    );
};

const TrendBadge = ({ delta, improving, C }: { delta: number; improving: boolean; C: ReturnType<typeof getMockupColors> }) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 500, color: improving ? C.green : C.amber }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {improving
                ? <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                : <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
            }
        </svg>
        {improving ? "+" : "-"}{delta}%
    </span>
);

const PEOPLE = [
    { name: "Alex Rivera", role: "Senior Engineer", score: 82, delta: 4, improving: true },
    { name: "Sarah Kim", role: "Staff Engineer", score: 91, delta: 2, improving: true },
    { name: "James Lee", role: "Engineer II", score: 68, delta: 3, improving: false },
    { name: "Kunle Fashola", role: "Senior Engineer", score: 77, delta: 6, improving: true },
];

const PersonRow = ({ name, role, score, delta, improving, isLast, C }: typeof PEOPLE[0] & { isLast: boolean; C: ReturnType<typeof getMockupColors> }) => (
    <div
        style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 0",
            borderBottom: isLast ? "none" : `1px solid rgba(${C.uiRgb}, 0.06)`,
        }}
    >
        <div style={{ width: 30, height: 30, borderRadius: "50%", background: `rgba(${C.uiRgb}, 0.1)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500, color: C.text, flexShrink: 0 }}>
            {name.charAt(0)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.text, lineHeight: 1.2 }}>{name}</div>
            <div style={{ fontSize: 11, color: C.textTer, marginTop: 3 }}>{role}</div>
        </div>
        <ScoreRing score={score} size={MINI_RING} sw={MINI_SW} r={MINI_R} c={MINI_C} C={C} />
        <div style={{ minWidth: 52, textAlign: "right" }}>
            <TrendBadge delta={delta} improving={improving} C={C} />
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textTer} strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
    </div>
);

export const EvaluationMockup = ({ variant = "dark" }: { variant?: MockupVariant }) => {
    const C = getMockupColors(variant);

    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                padding: "22px 28px",
                display: "flex",
                flexDirection: "column",
                gap: 18,
                fontFamily: C.sans,
                boxSizing: "border-box",
                background: C.bg,
                overflow: "hidden",
            }}
        >
            <h1 style={{ fontFamily: C.serif, fontSize: 22, color: C.text, fontWeight: 400, letterSpacing: "-0.3px", margin: 0 }}>
                Engineering Excellence
            </h1>

            <div style={{ display: "flex", gap: 40, alignItems: "baseline" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 10, color: C.textTer, textTransform: "uppercase", letterSpacing: "0.09em" }}>Score</span>
                    <span style={{ fontFamily: C.serif, fontSize: 42, fontWeight: 300, color: C.text, letterSpacing: -2, lineHeight: 1 }}>79</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 10, color: C.textTer, textTransform: "uppercase", letterSpacing: "0.09em" }}>Trend</span>
                    <span style={{ fontFamily: C.serif, fontSize: 42, fontWeight: 300, letterSpacing: -2, lineHeight: 1, color: C.green }}>+3%</span>
                </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 10, color: C.textTer, textTransform: "uppercase", letterSpacing: "0.09em" }}>People</span>
                    <div style={{ display: "flex", gap: 5 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid rgba(${C.uiRgb}, 0.08)`, display: "flex", alignItems: "center", justifyContent: "center", color: C.textSec }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                        </div>
                        <div style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid rgba(${C.uiRgb}, 0.08)`, display: "flex", alignItems: "center", justifyContent: "center", color: C.textSec }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14" /></svg>
                        </div>
                    </div>
                </div>
                <div style={{ borderTop: `1px solid rgba(${C.uiRgb}, 0.06)` }}>
                    {PEOPLE.map((p, i) => (
                        <PersonRow key={p.name} {...p} isLast={i === PEOPLE.length - 1} C={C} />
                    ))}
                </div>
            </div>
        </div>
    );
};
