import type { MasteryLevel } from "@/types";

export interface CellVisual {
    symbol: string;
    bg: string;
    color: string;
    borderColor: string;
    label: string;
}

export const MASTERY_VISUALS: Record<MasteryLevel, CellVisual> = {
    "not-introduced": {
        symbol: "",
        bg: "rgba(var(--ui-rgb), 0.04)",
        color: "var(--text-faint)",
        borderColor: "rgba(var(--ui-rgb), 0.06)",
        label: "Not introduced",
    },
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

export const MASTERY_ORDER: MasteryLevel[] = [
    "not-introduced",
    "introduced",
    "practising",
    "mastered",
];
