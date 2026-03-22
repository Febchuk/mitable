import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ActivityDay } from "./types";

interface WeekStripProps {
  weekStart: Date;
  weekDays: ActivityDay[];
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  canGoNext: boolean;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function WeekStrip({
  weekDays,
  selectedDate,
  onSelectDate,
  onPrevWeek,
  onNextWeek,
  canGoNext,
}: WeekStripProps) {
  const today = new Date();

  return (
    <div
      style={{
        background: "var(--bg-raised)",
        border: "var(--border-hairline)",
        borderRadius: 12,
        padding: "14px 10px",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {/* Prev arrow */}
      <button
        onClick={onPrevWeek}
        style={{
          width: 30,
          height: 30,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 6,
          color: "var(--text-tertiary)",
          background: "none",
          border: "none",
          cursor: "pointer",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.06)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "none";
        }}
      >
        <ChevronLeft size={14} />
      </button>

      {/* Days */}
      <div style={{ flex: 1, display: "flex", gap: 6, minWidth: 0 }}>
        {weekDays.map((day, i) => {
          const isToday = isSameDay(day.date, today);
          const isSelected = isSameDay(day.date, selectedDate);
          const hasActivity = day.workBlocks.length > 0;

          // Selected date gets the indigo highlight. Today without selection gets a subtle indicator.
          const highlighted = isSelected;

          return (
            <div
              key={day.id}
              onClick={() => onSelectDate(day.date)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
                padding: "8px 4px",
                borderRadius: 8,
                flex: 1,
                minWidth: 0,
                background: highlighted
                  ? "rgba(var(--mi-accent-rgb, 130,192,204), 0.11)"
                  : "transparent",
                border: highlighted
                  ? "0.5px solid rgba(var(--mi-accent-rgb, 130,192,204), 0.22)"
                  : "0.5px solid transparent",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (!highlighted) {
                  e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.04)";
                }
              }}
              onMouseLeave={(e) => {
                if (!highlighted) {
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              {/* Day name */}
              <span
                style={{
                  fontSize: 10,
                  color: highlighted
                    ? "var(--mi-accent)"
                    : isToday
                      ? "var(--mi-accent)"
                      : "var(--text-tertiary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {DAY_NAMES[i]}
              </span>

              {/* Day number */}
              <span
                style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: 20,
                  color: highlighted ? "var(--text-primary)" : isToday ? "var(--text-primary)" : "var(--text-secondary)",
                  fontWeight: 400,
                }}
              >
                {day.date.getDate()}
              </span>

              {/* Activity dot */}
              <div
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  background: hasActivity
                    ? highlighted || isToday
                      ? "var(--mi-accent)"
                      : "var(--text-tertiary)"
                    : "transparent",
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Next arrow */}
      <button
        onClick={onNextWeek}
        disabled={!canGoNext}
        style={{
          width: 30,
          height: 30,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 6,
          color: canGoNext ? "var(--text-tertiary)" : "var(--text-faint)",
          background: "none",
          border: "none",
          cursor: canGoNext ? "pointer" : "not-allowed",
          flexShrink: 0,
          opacity: canGoNext ? 1 : 0.4,
        }}
        onMouseEnter={(e) => {
          if (canGoNext) e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.06)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "none";
        }}
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
