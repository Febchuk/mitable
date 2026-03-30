"use client";

const C = {
    bg: "#1A1916",
    raised: "#211F1B",
    uiRgb: "236,232,224",
    accent: "#82C0CC",
    accentDark: "#5A8A95",
    text: "#ECE8E0",
    textSec: "#A09A8E",
    textTer: "#6B665C",
    green: "#3A9B6B",
    deepWork: "#B8DDE4",
    meetings: "#D4A27A",
    serif: 'var(--font-newsreader, "Newsreader"), Georgia, serif',
    sans: 'var(--font-dm-sans, "DM Sans"), system-ui, sans-serif',
};

const CUSTOMERS = [
    { label: "Acme Corp", pct: 38, hours: 14.2, color: C.accent },
    { label: "Initech", pct: 26, hours: 9.8, color: C.accentDark },
    { label: "Globex", pct: 21, hours: 7.9, color: "#A5C4A0" },
    { label: "Stark Ind.", pct: 15, hours: 5.6, color: "#7E8AA2" },
];

const ACTIVITIES = [
    { label: "Focus", minutes: 920, pct: 42 },
    { label: "Meetings", minutes: 640, pct: 29 },
    { label: "Communication", minutes: 350, pct: 16 },
    { label: "Research", minutes: 200, pct: 9 },
    { label: "Admin", minutes: 90, pct: 4 },
];

function fmtDuration(m: number) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    return h > 0 ? `${h}h ${min}m` : `${min}m`;
}

const DonutChart = () => {
    const size = 120;
    const sw = 12;
    const r = (size - sw) / 2;
    const circ = 2 * Math.PI * r;

    let offset = 0;
    const arcs = CUSTOMERS.map((c) => {
        const dash = (c.pct / 100) * circ;
        const arc = { dash, gap: circ - dash, offset, color: c.color };
        offset += dash;
        return arc;
    });

    return (
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`rgba(${C.uiRgb}, 0.04)`} strokeWidth={sw} />
            {arcs.map((a, i) => (
                <circle
                    key={i}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={a.color}
                    strokeWidth={sw}
                    strokeDasharray={`${a.dash} ${a.gap}`}
                    strokeDashoffset={-a.offset}
                    strokeLinecap="butt"
                />
            ))}
        </svg>
    );
};

const BarRow = ({ label, pct, minutes }: { label: string; pct: number; minutes: number }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ flex: "0 0 90px", fontSize: 12, color: C.textSec, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ height: 3, borderRadius: 999, background: `rgba(${C.uiRgb}, 0.06)`, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: C.deepWork }} />
            </div>
        </div>
        <span style={{ fontSize: 11, color: C.textTer, flexShrink: 0, minWidth: 38, textAlign: "right" }}>{fmtDuration(minutes)}</span>
        <span style={{ fontSize: 11, color: C.textTer, flexShrink: 0, minWidth: 28, textAlign: "right" }}>{pct}%</span>
    </div>
);

export const PersonDetailMockup = () => (
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
        {/* Person header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 999, background: `rgba(${C.uiRgb}, 0.1)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 600, color: C.text, flexShrink: 0 }}>
                A
            </div>
            <div>
                <h1 style={{ fontFamily: C.serif, fontSize: 22, fontWeight: 400, color: C.text, letterSpacing: "-0.3px", margin: 0 }}>Alex Rivera</h1>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
                    <span style={{ fontSize: 12, color: C.textSec }}>Senior Engineer</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: C.textSec }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#54705F" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
                        Active now
                    </span>
                </div>
            </div>
        </div>

        {/* Metrics */}
        <div style={{ display: "flex", gap: 48, alignItems: "baseline" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 10, color: C.textTer, textTransform: "uppercase", letterSpacing: "0.09em" }}>Average Focus Time</span>
                <span style={{ fontFamily: C.serif, fontSize: 36, fontWeight: 300, color: C.text, letterSpacing: -2, lineHeight: 1 }}>5.2h</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 10, color: C.textTer, textTransform: "uppercase", letterSpacing: "0.09em" }}>Time In Meetings</span>
                <span style={{ fontFamily: C.serif, fontSize: 36, fontWeight: 300, color: C.text, letterSpacing: -2, lineHeight: 1 }}>2.1h</span>
            </div>
        </div>

        {/* Two cards side-by-side */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, flex: 1, minHeight: 0, overflow: "hidden" }}>
            {/* Customer Work */}
            <div style={{ background: C.raised, border: `1px solid rgba(${C.uiRgb}, 0.04)`, borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.09em", color: C.textSec, marginBottom: 14 }}>Customer Work</span>
                <div style={{ display: "flex", alignItems: "center", gap: 18, flex: 1, minHeight: 0 }}>
                    <DonutChart />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, overflow: "hidden" }}>
                        {CUSTOMERS.map((c) => (
                            <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 14, height: 3, borderRadius: 999, background: c.color, flexShrink: 0 }} />
                                <span style={{ fontSize: 12, color: C.text, whiteSpace: "nowrap" }}>{c.label}</span>
                                <span style={{ fontSize: 11, color: C.textSec, flexShrink: 0, marginLeft: "auto" }}>{c.hours}h</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Activity Breakdown */}
            <div style={{ background: C.raised, border: `1px solid rgba(${C.uiRgb}, 0.04)`, borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.09em", color: C.textSec, marginBottom: 14 }}>Activity Breakdown</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0, overflow: "hidden" }}>
                    {ACTIVITIES.map((a) => (
                        <BarRow key={a.label} {...a} />
                    ))}
                </div>
            </div>
        </div>
    </div>
);
