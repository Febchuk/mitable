import type { MasteryLevel } from "@/types";

export interface CellVisual {
    symbol: string;
    bg: string;
    color: string;
    borderColor: string;
    label: string;
}

export const MASTERY_VISUALS: Record<MasteryLevel, CellVisual> = {
    introduced: {
        symbol: "I",
        bg: "rgba(var(--status-warning-rgb), 0.20)",
        color: "var(--status-warning)",
        borderColor: "rgba(var(--status-warning-rgb), 0.32)",
        label: "Introduced",
    },
    practising: {
        symbol: "P",
        bg: "rgba(var(--mi-accent-rgb), 0.22)",
        color: "var(--mi-accent)",
        borderColor: "rgba(var(--mi-accent-rgb), 0.35)",
        label: "Practising",
    },
    mastered: {
        symbol: "M",
        bg: "rgba(var(--status-success-rgb), 0.22)",
        color: "var(--status-success)",
        borderColor: "rgba(var(--status-success-rgb), 0.36)",
        label: "Mastered",
    },
};

// Visual used when a student has no recorded observation for a topic. Not
// part of MASTERY_VISUALS because it isn't a MasteryLevel — it's the absence
// of one.
export const EMPTY_CELL_VISUAL: CellVisual = {
    symbol: "",
    bg: "rgba(var(--ui-rgb), 0.04)",
    color: "var(--text-faint)",
    borderColor: "rgba(var(--ui-rgb), 0.06)",
    label: "Not introduced",
};

export function visualFor(level: MasteryLevel | null): CellVisual {
    return level ? MASTERY_VISUALS[level] : EMPTY_CELL_VISUAL;
}
