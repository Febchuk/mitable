"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Calendar, Star, AlertTriangle } from "./icons";
import type { ReportKind } from "./mock-data";

const TYPES: {
  kind: ReportKind;
  className: string;
  Icon: React.ComponentType<{ size?: number }>;
  description: string;
}[] = [
  {
    kind: "Daily",
    className: "nr-type-daily",
    Icon: Calendar,
    description: "A short snapshot of today.",
  },
  {
    kind: "Major",
    className: "nr-type-major",
    Icon: Star,
    description: "Term or milestone summary.",
  },
  {
    kind: "Incident",
    className: "nr-type-incident",
    Icon: AlertTriangle,
    description: "Something parents should know.",
  },
];

export function TypePicker({
  value,
  onChange,
  variant = "grid",
}: {
  value: ReportKind | null;
  onChange: (k: ReportKind) => void;
  /** "grid" = 3 columns (desktop). "stack" = stacked cards (mobile). */
  variant?: "grid" | "stack";
}) {
  const isStack = variant === "stack";
  return (
    <div className={isStack ? "nr-m-type-stack" : "nr-types"}>
      {TYPES.map(({ kind, className, Icon, description }) => {
        const selected = value === kind;
        const cardClass = isStack
          ? `nr-m-type-card ${className}${selected ? " nr-selected" : ""}`
          : `nr-type-card ${className}${selected ? " nr-selected" : ""}`;
        return (
          <button
            key={kind}
            type="button"
            className={cardClass}
            onClick={() => onChange(kind)}
            aria-pressed={selected}
          >
            <span className="nr-type-ico">
              <Icon size={isStack ? 20 : 16} />
            </span>
            {isStack ? (
              <div>
                <h3>{kind}</h3>
                <p>{description}</p>
              </div>
            ) : (
              <>
                <div className="nr-type-name">{kind}</div>
                <div className="nr-type-sub">{description}</div>
              </>
            )}
            {selected && (
              <span className="nr-type-check">
                <Check size={isStack ? 11 : 10} strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
