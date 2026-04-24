"use client";

import * as React from "react";

import { MASTERY_VISUALS } from "@/components/grid/cell-visuals";
import type { MasteryLevel } from "@/types";

const ORDER: MasteryLevel[] = ["introduced", "practising", "mastered"];

export function GridLegend() {
    return (
        <div className="flex items-center gap-3 text-[11px] text-ink-tertiary flex-wrap">
            {ORDER.map((lv) => {
                const v = MASTERY_VISUALS[lv];
                return (
                    <div key={lv} className="flex items-center gap-1.5">
                        <span
                            className="h-4 w-4 rounded-sm border flex items-center justify-center text-[11px] font-semibold"
                            style={{
                                background: v.bg,
                                color: v.color,
                                borderColor: v.borderColor,
                            }}
                        >
                            {v.symbol}
                        </span>
                        <span>{v.label}</span>
                    </div>
                );
            })}
        </div>
    );
}
