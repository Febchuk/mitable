"use client";

const C = {
    bg: "#1A1916",
    raised: "#211F1B",
    overlay: "#2A2824",
    muted: "#33312B",
    accent: "#82C0CC",
    accentMuted: "rgba(130,192,204,0.12)",
    text: "#ECE8E0",
    textSec: "#A09A8E",
    textMuted: "#706B60",
    border: "#33312B",
    serif: 'var(--font-newsreader, "Newsreader"), Georgia, serif',
    sans: 'var(--font-dm-sans, "DM Sans"), system-ui, sans-serif',
};

const SidebarItem = ({ label, active = false }: { label: string; active?: boolean }) => (
    <div
        style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 14px",
            fontSize: 12,
            fontFamily: C.sans,
            color: active ? C.accent : C.textSec,
            background: active ? C.accentMuted : "transparent",
        }}
    >
        {label}
    </div>
);

const InputField = ({ label, placeholder, type = "text" }: { label: string; placeholder: string; type?: string }) => (
    <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 10, color: C.textMuted, marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
            {label}
        </label>
        {type === "textarea" ? (
            <div
                style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "rgba(51,49,43,0.6)",
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    fontSize: 12,
                    color: C.textMuted,
                    minHeight: 48,
                    lineHeight: 1.5,
                }}
            >
                {placeholder}
            </div>
        ) : type === "select" ? (
            <div
                style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "rgba(51,49,43,0.6)",
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    fontSize: 12,
                    color: C.text,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                }}
            >
                <span>{placeholder}</span>
                <span style={{ color: C.textMuted, fontSize: 10 }}>▾</span>
            </div>
        ) : (
            <div
                style={{
                    width: "100%",
                    padding: "8px 12px",
                    background: "rgba(51,49,43,0.6)",
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    fontSize: 12,
                    color: C.textMuted,
                }}
            >
                {placeholder}
            </div>
        )}
    </div>
);

const BenchmarkCard = ({ name, status, rules }: { name: string; status: "Active" | "Draft"; rules: string }) => (
    <div
        style={{
            background: "rgba(42,40,36,0.6)",
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: "12px 14px",
        }}
    >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{name}</span>
            <span
                style={{
                    fontSize: 10,
                    padding: "2px 8px",
                    borderRadius: 3,
                    color: status === "Active" ? C.accent : C.textMuted,
                    background: status === "Active" ? C.accentMuted : "rgba(112,107,96,0.15)",
                }}
            >
                {status}
            </span>
        </div>
        <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.5 }}>{rules}</div>
    </div>
);

export const BenchmarkMockup = () => (
    <div style={{ display: "flex", height: 400, fontFamily: C.sans }}>
        {/* Sidebar */}
        <div
            style={{
                width: 140,
                background: C.raised,
                borderRight: `1px solid ${C.border}`,
                padding: "14px 0",
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
            }}
        >
            <div>
                <SidebarItem label="Dashboard" />
                <SidebarItem label="Agent" />
                <SidebarItem label="Reports" />
                <SidebarItem label="People" />
                <SidebarItem label="Benchmarks" active />
            </div>
            <div style={{ marginTop: "auto" }}>
                <div
                    style={{
                        padding: "10px 14px",
                        borderTop: `1px solid ${C.border}`,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                    }}
                >
                    <div
                        style={{
                            width: 24,
                            height: 24,
                            borderRadius: "50%",
                            background: C.accent,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 10,
                            fontWeight: 600,
                            color: C.bg,
                        }}
                    >
                        M
                    </div>
                    <div>
                        <div style={{ fontSize: 11, color: C.text, fontWeight: 500 }}>Mikun</div>
                        <div style={{ fontSize: 9, color: C.textMuted }}>Mitable</div>
                    </div>
                </div>
            </div>
        </div>

        {/* Main */}
        <div style={{ flex: 1, background: C.bg, overflowY: "auto", padding: "20px 22px" }}>
            <div style={{ fontFamily: C.serif, fontSize: 20, fontWeight: 400, color: C.text, marginBottom: 4 }}>
                Benchmarks
            </div>
            <div style={{ fontSize: 12, color: C.textSec, marginBottom: 20 }}>
                Define what good looks like for each role on your team.
            </div>

            {/* New Benchmark form */}
            <div
                style={{
                    background: C.raised,
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    padding: "16px 18px",
                    marginBottom: 14,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>New Benchmark</span>
                    <span
                        style={{
                            fontSize: 9,
                            padding: "2px 8px",
                            borderRadius: 3,
                            color: C.accent,
                            background: C.accentMuted,
                        }}
                    >
                        Draft
                    </span>
                </div>

                <InputField label="Name" placeholder="e.g., Senior Engineer" />
                <InputField label="Description" placeholder="What this benchmark measures..." type="textarea" />
                <InputField label="Expected Frequency" placeholder="Daily" type="select" />

                {/* Checkbox row */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <div
                        style={{
                            width: 16,
                            height: 16,
                            borderRadius: 4,
                            background: C.accent,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 5L4 7L8 3" stroke={C.bg} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <span style={{ fontSize: 11, color: C.textSec }}>Fulfill based on occurrence</span>
                </div>

                {/* Buttons */}
                <div style={{ display: "flex", gap: 8 }}>
                    <div
                        style={{
                            padding: "6px 14px",
                            borderRadius: 6,
                            border: `1px solid ${C.border}`,
                            fontSize: 11,
                            color: C.textSec,
                            cursor: "pointer",
                        }}
                    >
                        Save as Draft
                    </div>
                    <div
                        style={{
                            padding: "6px 14px",
                            borderRadius: 6,
                            background: C.accent,
                            fontSize: 11,
                            color: C.bg,
                            fontWeight: 500,
                            cursor: "pointer",
                        }}
                    >
                        Publish
                    </div>
                </div>
            </div>

            {/* Existing benchmarks */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <BenchmarkCard
                    name="Engineering"
                    status="Active"
                    rules="Focus time ≥ 4h/day · Code review ≤ 2h/day · Meeting load ≤ 20%"
                />
                <BenchmarkCard
                    name="Product"
                    status="Active"
                    rules="Research ≥ 1h/day · Stakeholder sync ≤ 3h/day · Docs ≥ 30min/day"
                />
            </div>
        </div>
    </div>
);
