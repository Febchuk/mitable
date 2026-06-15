"use client";

import * as React from "react";
import { AlertTriangle, Calendar, Star } from "lucide-react";
import type { ReportKind } from "./mock-data";

export type ReportTypeOption = {
  kind: ReportKind;
  label: string;
  description: string;
  iconTone: "daily" | "major" | "incident";
};

export const REPORT_TYPE_OPTIONS: ReportTypeOption[] = [
  {
    kind: "Daily",
    label: "Daily",
    description: "Progress marked in the last day.",
    iconTone: "daily",
  },
  {
    kind: "Major",
    label: "End-of-term",
    description: "Progress since the current term started.",
    iconTone: "major",
  },
  {
    kind: "Incident",
    label: "Incident",
    description: "Something parents should know — describe what happened.",
    iconTone: "incident",
  },
];

function iconFor(tone: ReportTypeOption["iconTone"]) {
  if (tone === "daily") return Calendar;
  if (tone === "major") return Star;
  return AlertTriangle;
}

export function ReportTypePicker({
  selected,
  onPick,
  variant = "desktop",
}: {
  selected: ReportKind | null;
  onPick: (kind: ReportKind) => void;
  variant?: "desktop" | "mobile";
}) {
  const rowClass = variant === "mobile" ? "nr-m-type-card" : "nr-type-card";
  return (
    <div
      className={variant === "mobile" ? "nr-m-type-list" : "nr-type-list"}
      role="radiogroup"
      aria-label="Report type"
    >
      {REPORT_TYPE_OPTIONS.map((opt) => {
        const Icon = iconFor(opt.iconTone);
        const isSelected = selected === opt.kind;
        return (
          <button
            key={opt.kind}
            type="button"
            role="radio"
            aria-checked={isSelected}
            className={`${rowClass} nr-type-${opt.iconTone}${isSelected ? " nr-selected" : ""}`}
            onClick={() => onPick(opt.kind)}
          >
            <span className="nr-type-ico">
              <Icon size={16} strokeWidth={2} aria-hidden />
            </span>
            <span style={{ minWidth: 0, textAlign: variant === "mobile" ? "left" : undefined }}>
              <span className="nr-type-name">{opt.label}</span>
              <span className="nr-type-sub">{opt.description}</span>
            </span>
            {isSelected ? <span className="nr-type-check" aria-hidden /> : null}
          </button>
        );
      })}
    </div>
  );
}
