"use client";

import * as React from "react";
import { FileText, Pencil } from "lucide-react";

export type ViewMode = "editor" | "preview";

const OPTIONS: {
  value: ViewMode;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}[] = [
  { value: "editor", label: "Editor", icon: Pencil },
  { value: "preview", label: "Preview PDF", icon: FileText },
];

export function ViewModeToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (next: ViewMode) => void;
}) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const focusAt = (idx: number) => {
    const wrapped = (idx + OPTIONS.length) % OPTIONS.length;
    refs.current[wrapped]?.focus();
    onChange(OPTIONS[wrapped].value);
  };

  return (
    <div className="rd-view-toggle" role="radiogroup" aria-label="View mode">
      {OPTIONS.map((opt, idx) => {
        const Icon = opt.icon;
        const checked = value === opt.value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[idx] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className={`rd-view-toggle-segment${checked ? " rd-view-toggle-segment-active" : ""}`}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                focusAt(idx + 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                focusAt(idx - 1);
              }
            }}
          >
            <Icon size={13} strokeWidth={2} />
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
