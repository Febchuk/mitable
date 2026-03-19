import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useDashboardMetrics } from "@/console/src/hooks/queries/admin";
import type { DashboardPeriod, DashboardMetrics } from "@/console/src/services/adminService";

type TimeFilter = "yesterday" | "week" | "month" | "ytd" | "all";

const FILTERS: { key: TimeFilter; label: string }[] = [
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "All" },
];

const FILTER_TO_PERIOD: Record<TimeFilter, DashboardPeriod> = {
  yesterday: "yesterday",
  week: "week",
  month: "month",
  ytd: "ytd",
  all: "all",
};

const VALID_FILTERS = new Set<TimeFilter>(["yesterday", "week", "month", "ytd", "all"]);

const DEEP_WORK_COLOR = "#9B84E8";
const MEETINGS_COLOR = "#3D3068";
const AXIS_COLOR = "#9B9689";

interface ChartDataPoint {
  label: string;
  deepWork: number; // minutes
  meetings: number; // minutes
}

function formatHour(h: number): string {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

function shortDate(date: Date): string {
  return `${date.toLocaleDateString("en", { month: "short" })} ${date.getDate()}`;
}

// Realistic 24h activity distribution — peaks 9am–5pm, quiet overnight
const HOUR_WEIGHTS = [
  0.02, 0.01, 0.01, 0.01, 0.01, 0.02, // 12am–5am
  0.03, 0.05, 0.07,                     // 6am–8am
  0.10, 0.12, 0.13, 0.12,               // 9am–12pm
  0.08, 0.11, 0.10, 0.09, 0.07,         // 1pm–5pm
  0.04, 0.03, 0.02, 0.02, 0.01, 0.01,  // 6pm–11pm
];

function buildChartData(api: DashboardMetrics, filter: TimeFilter): ChartDataPoint[] {
  const trend = api.dailyTrend || [];
  if (!trend.length) return [];

  if (filter === "yesterday") {
    const entry = trend[0];
    if (!entry) return [];
    const totalW = HOUR_WEIGHTS.reduce((a, b) => a + b, 0);
    return HOUR_WEIGHTS.map((w, i) => ({
      label: formatHour(i),
      deepWork: Math.max(0, Math.round((entry.avgWorkMinutes * w) / totalW)),
      meetings: Math.max(0, Math.round((entry.avgMeetingMinutes * w) / totalW)),
    }));
  }

  if (filter === "week") {
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const lookup = new Map(trend.map((d) => [d.date, d]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(today);
      date.setDate(date.getDate() - (6 - i));
      const key = date.toISOString().split("T")[0]!;
      const entry = lookup.get(key);
      return {
        label: dayNames[date.getDay() === 0 ? 6 : date.getDay() - 1] || "?",
        deepWork: entry ? Math.round(entry.avgWorkMinutes) : 0,
        meetings: entry ? Math.round(entry.avgMeetingMinutes) : 0,
      };
    });
  }

  if (filter === "month") {
    return trend.map((d) => {
      const date = new Date(d.date);
      return {
        label: shortDate(date),
        deepWork: Math.round(d.avgWorkMinutes),
        meetings: Math.round(d.avgMeetingMinutes),
      };
    });
  }

  // YTD and All — aggregate daily entries into monthly buckets
  const buckets = new Map<string, { deepWork: number; meetings: number; label: string }>();
  for (const d of trend) {
    const date = new Date(d.date);
    const key = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, "0")}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.deepWork += d.avgWorkMinutes;
      existing.meetings += d.avgMeetingMinutes;
    } else {
      buckets.set(key, {
        deepWork: d.avgWorkMinutes,
        meetings: d.avgMeetingMinutes,
        label: date.toLocaleDateString("en", { month: "short" }),
      });
    }
  }
  return [...buckets.values()].map((b) => ({
    label: b.label,
    deepWork: Math.round(b.deepWork),
    meetings: Math.round(b.meetings),
  }));
}

/**
 * Pick ~5 evenly-spaced label indices, always including first and last.
 * For small datasets (≤10 points), label everything.
 */
function sparseIndices(n: number, maxLabels = 8): Set<number> {
  if (n <= maxLabels) {
    return new Set(Array.from({ length: n }, (_, i) => i));
  }
  const step = Math.ceil(n / maxLabels);
  const indices = new Set<number>();
  for (let i = 0; i < n; i += step) indices.add(i);
  return indices;
}

/**
 * Pick the best unit (minutes or hours) and a clean step size
 * so the Y-axis reads naturally: "1h, 2h, 3h" not "30m, 60m, 90m, 120m".
 */
function niceAxis(rawMax: number): { step: number; unit: "m" | "h"; divisor: number } {
  if (rawMax <= 0) return { step: 15, unit: "m", divisor: 1 };

  // Use hours when data exceeds 60 minutes
  if (rawMax >= 60) {
    const maxH = rawMax / 60;
    const rough = maxH / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const r = rough / mag;
    let nice: number;
    if (r <= 1.5) nice = 1;
    else if (r <= 3) nice = 2;
    else if (r <= 7) nice = 5;
    else nice = 10;
    return { step: Math.max(1, nice * mag) * 60, unit: "h", divisor: 60 };
  }

  // Under 60 min — keep minutes with clean steps
  const rough = rawMax / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const r = rough / mag;
  let nice: number;
  if (r <= 1.5) nice = 1;
  else if (r <= 3) nice = 2;
  else if (r <= 7) nice = 5;
  else nice = 10;
  return { step: Math.max(1, nice * mag), unit: "m", divisor: 1 };
}

function drawChart(canvas: HTMLCanvasElement, data: ChartDataPoint[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const W = rect.width;
  const H = rect.height;

  ctx.clearRect(0, 0, W, H);

  if (!data.length) {
    ctx.fillStyle = AXIS_COLOR;
    ctx.font = "12px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No data for this period", W / 2, H / 2);
    return;
  }

  const padLeft = 48;
  const padRight = 12;
  const padTop = 8;
  const padBottom = 28;

  const chartW = W - padLeft - padRight;
  const chartH = H - padTop - padBottom;

  const n = data.length;
  const rawMax = Math.max(1, ...data.map((d) => Math.max(d.deepWork, d.meetings)));

  // Nice Y-axis: pick unit (h or m) and clean step
  const { step, unit, divisor } = niceAxis(rawMax);
  const maxVal = Math.ceil(rawMax / step) * step;

  // Grid lines at each step interval
  ctx.strokeStyle = "rgba(236, 232, 224, 0.04)";
  ctx.lineWidth = 1;
  for (let v = step; v <= maxVal; v += step) {
    const y = padTop + chartH * (1 - v / maxVal);
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + chartW, y);
    ctx.stroke();
  }

  // Y-axis labels at each step
  ctx.fillStyle = AXIS_COLOR;
  ctx.font = "10px Inter, system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`0${unit}`, padLeft - 8, padTop + chartH + 3);
  for (let v = step; v <= maxVal; v += step) {
    const y = padTop + chartH * (1 - v / maxVal);
    ctx.fillText(`${Math.round(v / divisor)}${unit}`, padLeft - 8, y + 3);
  }

  // Bar sizing per the brief
  const groupW = chartW / n;
  const barW = Math.max(3, Math.min(groupW * 0.3, 28));
  const gap = Math.max(1.5, barW * 0.15);
  const radius = 3;

  const labelSet = sparseIndices(n);

  for (let i = 0; i < n; i++) {
    const d = data[i];
    const groupX = padLeft + i * groupW;
    const centerX = groupX + groupW / 2;

    const dwIsZero = d.deepWork < 1;
    const mtIsZero = d.meetings < 1;

    if (!dwIsZero && !mtIsZero) {
      const dwH = (d.deepWork / maxVal) * chartH;
      const dwX = centerX - barW - gap / 2;
      drawRoundedTopBar(ctx, dwX, padTop + chartH - dwH, barW, dwH, radius, DEEP_WORK_COLOR);

      const mtH = (d.meetings / maxVal) * chartH;
      const mtX = centerX + gap / 2;
      drawRoundedTopBar(ctx, mtX, padTop + chartH - mtH, barW, mtH, radius, MEETINGS_COLOR);
    } else if (!dwIsZero) {
      const dwH = (d.deepWork / maxVal) * chartH;
      const dwX = centerX - barW / 2;
      drawRoundedTopBar(ctx, dwX, padTop + chartH - dwH, barW, dwH, radius, DEEP_WORK_COLOR);
    } else if (!mtIsZero) {
      const mtH = (d.meetings / maxVal) * chartH;
      const mtX = centerX - barW / 2;
      drawRoundedTopBar(ctx, mtX, padTop + chartH - mtH, barW, mtH, radius, MEETINGS_COLOR);
    }

    if (labelSet.has(i)) {
      ctx.fillStyle = AXIS_COLOR;
      ctx.font = "10px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(d.label, centerX, padTop + chartH + 16);
    }
  }

}

function drawRoundedTopBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string
) {
  if (h < 1) return;
  const cr = Math.min(r, w / 2, h);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + cr);
  ctx.arcTo(x, y, x + cr, y, cr);
  ctx.arcTo(x + w, y, x + w, y + cr, cr);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
}

/**
 * Adaptive duration formatting:
 * - Yesterday filter always shows hours
 * - <48h  → hours  (e.g. "37h")
 * - <7d   → days   (e.g. "3d")
 * - <52w  → weeks  (e.g. "12w")
 * - ≥52w  → years  (e.g. "2y")
 */
function formatDuration(totalMinutes: number, filter: TimeFilter): string {
  const hours = Math.round(totalMinutes / 60);

  if (filter === "yesterday" || hours < 48) {
    return `${hours.toLocaleString()}h`;
  }

  const days = Math.round(hours / 24);
  if (days < 7) {
    return `${days}d`;
  }

  const weeks = Math.round(days / 7);
  if (weeks < 52) {
    return `${weeks}w`;
  }

  const years = Math.round(weeks / 52);
  return `${years}y`;
}

function statLabel(totalMinutes: number, filter: TimeFilter): string {
  const hours = Math.round(totalMinutes / 60);
  if (filter === "yesterday" || hours < 48) return "Hours recorded";
  const days = Math.round(hours / 24);
  if (days < 7) return "Days recorded";
  const weeks = Math.round(days / 7);
  if (weeks < 52) return "Weeks recorded";
  return "Years recorded";
}

export default function DashboardView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilter = searchParams.get("period") as TimeFilter | null;
  const [filter, setFilter] = useState<TimeFilter>(
    initialFilter && VALID_FILTERS.has(initialFilter) ? initialFilter : "yesterday"
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleFilterChange = useCallback(
    (f: TimeFilter) => {
      setFilter(f);
      setSearchParams({ period: f }, { replace: true });
    },
    [setSearchParams]
  );

  const { data: apiData } = useDashboardMetrics(FILTER_TO_PERIOD[filter]);

  const totalMinutes = useMemo(() => {
    if (!apiData?.hasData) return 0;
    return apiData.metrics.totalTeamWorkMinutes + apiData.metrics.totalTeamMeetingMinutes;
  }, [apiData]);

  const durationDisplay = useMemo(() => formatDuration(totalMinutes, filter), [totalMinutes, filter]);
  const durationLabel = useMemo(() => statLabel(totalMinutes, filter), [totalMinutes, filter]);

  const peopleActive = useMemo(() => {
    if (!apiData?.hasData) return "0";
    return `${apiData.metrics.totalUsersTracked}`;
  }, [apiData]);

  const chartData = useMemo(() => {
    if (!apiData?.hasData) return [];
    return buildChartData(apiData, filter);
  }, [apiData, filter]);

  useEffect(() => {
    if (!canvasRef.current) return;
    drawChart(canvasRef.current, chartData);
  }, [chartData]);

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        drawChart(canvasRef.current, chartData);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [chartData]);

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "32px 36px",
        display: "flex",
        flexDirection: "column",
        gap: 32,
      }}
    >
      {/* Page header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 26,
            color: "#ECE8E0",
            fontWeight: 400,
            letterSpacing: "-0.3px",
            margin: 0,
          }}
        >
          Dashboard
        </h1>

        {/* Time filter bar */}
        <div
          style={{
            display: "flex",
            gap: 1,
            background: "rgba(236, 232, 224, 0.05)",
            borderRadius: 7,
            padding: 3,
          }}
        >
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => handleFilterChange(f.key)}
              style={{
                padding: "4px 12px",
                borderRadius: 5,
                fontSize: 11,
                fontFamily: "var(--font-sans)",
                color: filter === f.key ? "#ECE8E0" : "#9B9689",
                background: filter === f.key ? "#2A2824" : "transparent",
                border: "none",
                cursor: "pointer",
                transition: "background 0.1s, color 0.1s",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Headline stats */}
      <div style={{ display: "flex", gap: 56, alignItems: "flex-end", padding: "0 2px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span
            style={{
              fontSize: 10,
              color: "#6B665C",
              textTransform: "uppercase",
              letterSpacing: "0.09em",
              fontFamily: "var(--font-sans)",
            }}
          >
            {durationLabel}
          </span>
          <span
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 48,
              color: "#ECE8E0",
              fontWeight: 300,
              letterSpacing: -2,
              lineHeight: 1,
            }}
          >
            {durationDisplay}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span
            style={{
              fontSize: 10,
              color: "#6B665C",
              textTransform: "uppercase",
              letterSpacing: "0.09em",
              fontFamily: "var(--font-sans)",
            }}
          >
            People active
          </span>
          <span
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 48,
              color: "#ECE8E0",
              fontWeight: 300,
              letterSpacing: -2,
              lineHeight: 1,
            }}
          >
            {peopleActive}
          </span>
        </div>
      </div>

      {/* Team active time chart card */}
      <div
        style={{
          background: "#211F1B",
          border: "0.5px solid rgba(236, 232, 224, 0.07)",
          borderRadius: 12,
          padding: "22px 24px 16px",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        {/* Card header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <span
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.09em",
              color: "#9B9689",
              fontFamily: "var(--font-sans)",
            }}
          >
            Team active time
          </span>

          {/* Legend */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  width: 20,
                  height: 3,
                  borderRadius: 1.5,
                  background: DEEP_WORK_COLOR,
                }}
              />
              <span style={{ fontSize: 11, color: "#9B9689", fontFamily: "var(--font-sans)" }}>
                Deep work
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  width: 20,
                  height: 3,
                  borderRadius: 1.5,
                  background: MEETINGS_COLOR,
                }}
              />
              <span style={{ fontSize: 11, color: "#9B9689", fontFamily: "var(--font-sans)" }}>
                Meetings
              </span>
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div style={{ flex: 1, minHeight: 200 }}>
          <canvas
            ref={canvasRef}
            style={{ width: "100%", height: "100%", display: "block" }}
          />
        </div>
      </div>
    </div>
  );
}
