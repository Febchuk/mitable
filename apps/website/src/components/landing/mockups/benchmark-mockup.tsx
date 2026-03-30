"use client";

const C = {
    bg: "#1A1916",
    raised: "#211F1B",
    overlay: "#2A2824",
    muted: "#33312B",
    accent: "#82C0CC",
    accentRgb: "130,192,204",
    uiRgb: "236,232,224",
    text: "#ECE8E0",
    textSec: "#A09A8E",
    textTer: "#6B665C",
    textFaint: "#4A4640",
    serif: 'var(--font-newsreader, "Newsreader"), Georgia, serif',
    sans: 'var(--font-dm-sans, "DM Sans"), system-ui, sans-serif',
};

const PARAMS = [
    { name: "Code Quality", desc: "Consistency of clean, well-tested commits with minimal rework", importance: 5 },
    { name: "Communication", desc: "Proactive updates, clear async writing, and meeting participation", importance: 4 },
    { name: "Documentation", desc: "Maintains up-to-date docs for APIs, architecture decisions, and onboarding", importance: 3 },
];

const ImportanceDots = ({ value }: { value: number }) => (
    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
        {[1, 2, 3, 4, 5].map((level) => (
            <div
                key={level}
                style={{
                    width: 11,
                    height: 11,
                    borderRadius: "50%",
                    background: level <= value ? C.text : `rgba(${C.uiRgb}, 0.12)`,
                    transition: "background 0.15s",
                }}
            />
        ))}
    </div>
);

const ParameterRow = ({ name, desc, importance, isLast }: { name: string; desc: string; importance: number; isLast: boolean }) => (
    <div
        style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "12px 0",
            borderBottom: isLast ? "none" : `1px solid rgba(${C.uiRgb}, 0.06)`,
        }}
    >
        <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.text, lineHeight: 1.2 }}>{name}</div>
            <div style={{ fontSize: 11, color: C.textTer, marginTop: 4, lineHeight: 1.4 }}>{desc}</div>
        </div>
        <ImportanceDots value={importance} />
    </div>
);

export const BenchmarkMockup = () => (
    <div
        style={{
            width: "100%",
            height: "100%",
            padding: "22px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            fontFamily: C.sans,
            boxSizing: "border-box",
            background: C.bg,
            overflow: "hidden",
        }}
    >
        {/* Title */}
        <h1 style={{ fontFamily: C.serif, fontSize: 22, color: C.text, fontWeight: 400, letterSpacing: "-0.3px", margin: 0 }}>
            New Benchmark
        </h1>

        {/* Name + Frequency on one row */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-end" }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
                <label style={{ fontSize: 10, color: C.textTer, textTransform: "uppercase", letterSpacing: "0.09em" }}>Name</label>
                <div style={{ fontSize: 13, color: C.text, background: `rgba(${C.uiRgb}, 0.03)`, border: `1px solid rgba(${C.uiRgb}, 0.08)`, borderRadius: 8, padding: "8px 12px" }}>
                    Engineering Excellence
                </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <label style={{ fontSize: 10, color: C.textTer, textTransform: "uppercase", letterSpacing: "0.09em" }}>Frequency</label>
                <div style={{ display: "inline-flex", gap: 3, background: `rgba(${C.uiRgb}, 0.05)`, borderRadius: 7, padding: 3 }}>
                    {["Weekly", "Monthly", "Quarterly"].map((f) => (
                        <div key={f} style={{ padding: "4px 10px", borderRadius: 5, fontSize: 11, color: f === "Monthly" ? C.text : C.textTer, background: f === "Monthly" ? "rgba(255,255,255,0.08)" : "transparent" }}>
                            {f}
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* Description */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 10, color: C.textTer, textTransform: "uppercase", letterSpacing: "0.09em" }}>Description</label>
            <div style={{ fontSize: 13, color: C.textSec, background: `rgba(${C.uiRgb}, 0.03)`, border: `1px solid rgba(${C.uiRgb}, 0.08)`, borderRadius: 8, padding: "8px 12px", lineHeight: 1.5 }}>
                Measures the quality, consistency, and impact of an engineer's day-to-day output.
            </div>
        </div>

        {/* Parameters */}
        <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 10, color: C.textTer, textTransform: "uppercase", letterSpacing: "0.09em" }}>Parameters</span>
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
                {PARAMS.map((p, i) => (
                    <ParameterRow key={p.name} name={p.name} desc={p.desc} importance={p.importance} isLast={i === PARAMS.length - 1} />
                ))}
            </div>
        </div>

        {/* Save */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div style={{ height: 36, padding: "0 24px", borderRadius: 8, fontSize: 12, fontWeight: 500, background: C.text, color: C.bg, display: "flex", alignItems: "center" }}>
                Save
            </div>
        </div>
    </div>
);
