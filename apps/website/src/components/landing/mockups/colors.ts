export type MockupVariant = "dark" | "light";

const DARK = {
    bg: "#1A1916",
    raised: "#211F1B",
    overlay: "#2A2824",
    muted: "#33312B",
    accent: "#82C0CC",
    accentDark: "#5A8A95",
    accentMuted: "rgba(130,192,204,0.12)",
    accentRgb: "130,192,204",
    uiRgb: "236,232,224",
    text: "#ECE8E0",
    textSec: "#A09A8E",
    textTer: "#6B665C",
    textMuted: "#706B60",
    textFaint: "#4A4640",
    border: "#33312B",
    borderSubtle: "#2A2824",
    green: "#3A9B6B",
    red: "#EF4444",
    amber: "#D4A27A",
    deepWork: "#B8DDE4",
    meetings: "#D4A27A",
    serif: 'var(--font-newsreader, "Newsreader"), Georgia, serif',
    sans: 'var(--font-dm-sans, "DM Sans"), system-ui, sans-serif',
    mono: 'var(--font-jetbrains-mono, "JetBrains Mono"), "Fira Code", monospace',
};

const LIGHT = {
    bg: "#F5F1ED",
    raised: "#FAF8F6",
    overlay: "#FDFCFB",
    muted: "#E8E2DC",
    accent: "#2A7F8E",
    accentDark: "#16697A",
    accentMuted: "rgba(42,127,142,0.08)",
    accentRgb: "42,127,142",
    uiRgb: "28,43,51",
    text: "#1C2B33",
    textSec: "#5C6B73",
    textTer: "#8A9199",
    textMuted: "#8A9199",
    textFaint: "#B0B7BC",
    border: "#E0D9D1",
    borderSubtle: "#E8E2DC",
    green: "#2D8659",
    red: "#D45555",
    amber: "#B8854A",
    deepWork: "#16697A",
    meetings: "#B8854A",
    serif: 'var(--font-newsreader, "Newsreader"), Georgia, serif',
    sans: 'var(--font-dm-sans, "DM Sans"), system-ui, sans-serif',
    mono: 'var(--font-jetbrains-mono, "JetBrains Mono"), "Fira Code", monospace',
};

export type MockupColors = typeof DARK;

export function getMockupColors(variant: MockupVariant = "dark"): MockupColors {
    return variant === "light" ? LIGHT : DARK;
}
