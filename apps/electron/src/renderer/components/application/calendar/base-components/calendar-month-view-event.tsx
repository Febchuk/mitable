"use client";

import { cx } from "@/lib/utils/cx";

export const eventViewColors = {
    gray: {
        root: "bg-canvas-muted ring-stroke-subtle hover:bg-canvas-overlay",
        label: "text-ink-secondary",
        time: "text-ink-tertiary",
        dot: "bg-ink-tertiary",
    },
    brand: {
        root: "bg-indigo/15 ring-indigo/30 hover:bg-indigo/25",
        label: "text-indigo-light",
        time: "text-indigo/80",
        dot: "bg-indigo",
    },
    green: {
        root: "bg-emerald/15 ring-emerald/30 hover:bg-emerald/25",
        label: "text-emerald",
        time: "text-emerald/80",
        dot: "bg-emerald",
    },
    blue: {
        root: "bg-blue-500/15 ring-blue-500/30 hover:bg-blue-500/25",
        label: "text-blue-400",
        time: "text-blue-400/80",
        dot: "bg-blue-500",
    },
    indigo: {
        root: "bg-indigo/15 ring-indigo/30 hover:bg-indigo/25",
        label: "text-indigo-light",
        time: "text-indigo/80",
        dot: "bg-indigo",
    },
    purple: {
        root: "bg-purple-500/15 ring-purple-500/30 hover:bg-purple-500/25",
        label: "text-purple-400",
        time: "text-purple-400/80",
        dot: "bg-purple-500",
    },
    pink: {
        root: "bg-rose/15 ring-rose/30 hover:bg-rose/25",
        label: "text-rose",
        time: "text-rose/80",
        dot: "bg-rose",
    },
    orange: {
        root: "bg-orange-500/15 ring-orange-500/30 hover:bg-orange-500/25",
        label: "text-orange-400",
        time: "text-orange-400/80",
        dot: "bg-orange-500",
    },
    yellow: {
        root: "bg-yellow-500/15 ring-yellow-500/30 hover:bg-yellow-500/25",
        label: "text-yellow-400",
        time: "text-yellow-400/80",
        dot: "bg-yellow-500",
    },
};

export type EventViewColor = keyof typeof eventViewColors;

interface CalendarMonthViewEventProps {
    label: string;
    supportingText?: string;
    withDot?: boolean;
    color?: EventViewColor;
    collapseOnMobile?: boolean;
}

export const CalendarMonthViewEvent = ({ label, supportingText, color = "gray", collapseOnMobile = false }: CalendarMonthViewEventProps) => {
    return (
        <>
            <div className={cx("inline-flex size-2 items-center justify-center md:hidden", !collapseOnMobile && "hidden")}>
                <span className={cx("size-1.5 rounded-full", eventViewColors[color].dot)}></span>
            </div>

            <div
                className={cx(
                    "flex w-full cursor-pointer items-center gap-1 rounded-md px-2 py-1 ring-1 ring-inset",
                    collapseOnMobile && "max-md:hidden",
                    eventViewColors[color].root,
                )}
            >
                <div className="flex w-full items-center justify-between gap-0.5">
                    <span className={cx("flex-1 truncate text-xs font-semibold", eventViewColors[color].label)}>{label}</span>
                    {supportingText && <time className={cx("text-xs", eventViewColors[color].time)}>{supportingText}</time>}
                </div>
            </div>
        </>
    );
};
