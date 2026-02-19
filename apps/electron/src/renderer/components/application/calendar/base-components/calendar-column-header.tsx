"use client";

import { cx } from "@/lib/utils/cx";

interface CalendarColumnHeaderProps {
  weekDay: string;
  day?: number;
  state?: "default" | "selected" | "current";
  className?: string;
  onClick?: () => void;
}

export const CalendarColumnHeader = ({
  state,
  weekDay,
  day,
  className,
  onClick,
}: CalendarColumnHeaderProps) => {
  return (
    <div
      onClick={onClick}
      className={cx(
        "relative flex w-full flex-col items-center justify-center gap-1.5 p-2 md:flex-row md:gap-1",
        "bg-canvas-raised",
        "before:pointer-events-none before:absolute before:inset-0 before:border-stroke-subtle not-last:before:border-r",
        className
      )}
    >
      <span className="text-xs font-medium text-ink-tertiary">{weekDay}</span>
      {typeof day === "number" && (
        <span
          className={cx(
            "flex h-6 items-center justify-center text-xs font-semibold text-ink-secondary",
            state === "selected" && "w-6 rounded-full bg-indigo text-white",
            state === "current" && "w-6 rounded-full bg-indigo/20 text-indigo-light"
          )}
        >
          {day}
        </span>
      )}
    </div>
  );
};
