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
        background: "#211F1B",
        border: "0.5px solid rgba(236, 232, 224, 0.07)",
        borderRadius: 12,
        padding: "14px 10px",
        display: "flex",
        alignItems: "center",
        gap: 2,
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
            color: "#6B665C",
            background: "none",
            border: "none",
            cursor: "pointer",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(236, 232, 224, 0.06)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "none";
          }}
        >
          <ChevronLeft size={14} />
        </button>

        {/* Days */}
        <div style={{ flex: 1, display: "flex", minWidth: 0 }}>
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
                  background: highlighted ? "rgba(155, 132, 232, 0.11)" : "transparent",
                  border: highlighted
                    ? "0.5px solid rgba(155, 132, 232, 0.22)"
                    : "0.5px solid transparent",
                  transition: "background 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (!highlighted) {
                    e.currentTarget.style.background = "rgba(236, 232, 224, 0.04)";
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
                    color: highlighted ? "#9B84E8" : isToday ? "#9B84E8" : "#6B665C",
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
                    color: highlighted ? "#ECE8E0" : isToday ? "#ECE8E0" : "#9B9689",
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
                        ? "#9B84E8"
                        : "#6B665C"
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
            color: canGoNext ? "#6B665C" : "#4A4640",
            background: "none",
            border: "none",
            cursor: canGoNext ? "pointer" : "not-allowed",
            flexShrink: 0,
            opacity: canGoNext ? 1 : 0.4,
          }}
          onMouseEnter={(e) => {
            if (canGoNext) e.currentTarget.style.background = "rgba(236, 232, 224, 0.06)";
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
