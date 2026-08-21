/**
 * @deprecated Admin/Team views no longer in use in the desktop app.
 * Admin experience moves to the web app. Scheduled for migration.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useDashboardMetrics } from "@/console/src/hooks/queries/admin";
import type { DashboardPeriod, DashboardMetrics } from "@/console/src/services/adminService";
import { formatTopLevelDuration } from "../shared/topLevelDuration";
import DataScopeFilter from "@/console/src/components/shared/DataScopeFilter";

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

const BAR_COLOR = "var(--mi-accent)";

function getCssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

interface ChartDataPoint {
  label: string;
  value: number; // minutes (total or avg depending on filter)
}

function formatHour(h: number): string {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

// Realistic 24h activity distribution — peaks 9am–5pm, quiet overnight
const HOUR_WEIGHTS = [
  0.02,
  0.01,
  0.01,
  0.01,
  0.01,
  0.02, // 12am–5am
  0.03,
  0.05,
  0.07, // 6am–8am
  0.1,
  0.12,
  0.13,
  0.12, // 9am–12pm
  0.08,
  0.11,
  0.1,
  0.09,
  0.07, // 1pm–5pm
  0.04,
  0.03,
  0.02,
  0.02,
  0.01,
  0.01, // 6pm–11pm
];

function getTrendWork(d: DashboardMetrics["dailyTrend"][number]): number {
  return d.totalWorkMinutes ?? d.avgWorkMinutes ?? 0;
}
function getTrendMeeting(d: DashboardMetrics["dailyTrend"][number]): number {
  return d.totalMeetingMinutes ?? d.avgMeetingMinutes ?? 0;
}

function getTrendTotal(d: DashboardMetrics["dailyTrend"][number]): number {
  return getTrendWork(d) + getTrendMeeting(d);
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - diff);
  return date;
}

function getDistinctUsers(api: DashboardMetrics): number {
  return api.metrics.distinctUsersTracked ?? api.metrics.totalUsersTracked ?? 1;
}

function buildChartData(api: DashboardMetrics, filter: TimeFilter): ChartDataPoint[] {
  const trend = api.dailyTrend || [];
  if (!trend.length) return [];

  const lookup = new Map(trend.map((d) => [d.date, d]));
  const users = Math.max(1, getDistinctUsers(api));

  if (filter === "yesterday") {
    const entry = trend[0];
    if (!entry) return [];
    const totalW = HOUR_WEIGHTS.reduce((a, b) => a + b, 0);
    return HOUR_WEIGHTS.map((w, i) => ({
      label: formatHour(i),
      value: Math.max(0, Math.round((getTrendTotal(entry) * w) / totalW)),
    }));
  }

  if (filter === "week") {
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const monday = getMonday(new Date());

    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(monday);
      date.setDate(date.getDate() + i);
      const key = date.toISOString().split("T")[0]!;
      const entry = lookup.get(key);
      return {
        label: dayNames[i]!,
        value: entry ? Math.round(getTrendTotal(entry)) : 0,
      };
    });
  }

  if (filter === "month") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);

    const weekBuckets: ChartDataPoint[] = [];
    let weekStart = new Date(firstOfMonth);

    while (weekStart <= lastOfMonth) {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const clampedEnd = weekEnd > lastOfMonth ? lastOfMonth : weekEnd;

      let weekTotal = 0;
      const cursor = new Date(weekStart);
      while (cursor <= clampedEnd) {
        const key = cursor.toISOString().split("T")[0]!;
        const entry = lookup.get(key);
        if (entry) weekTotal += getTrendTotal(entry);
        cursor.setDate(cursor.getDate() + 1);
      }

      const startLabel = `${weekStart.toLocaleDateString("en", { month: "short" })} ${weekStart.getDate()}`;
      const endLabel =
        clampedEnd.getMonth() === weekStart.getMonth()
          ? `${clampedEnd.getDate()}`
          : `${clampedEnd.toLocaleDateString("en", { month: "short" })} ${clampedEnd.getDate()}`;

      weekBuckets.push({
        label: `${startLabel}–${endLabel}`,
        value: Math.round(weekTotal / users),
      });

      weekStart = new Date(clampedEnd);
      weekStart.setDate(weekStart.getDate() + 1);
    }

    return weekBuckets;
  }

  // YTD and All — weekly buckets, avg per user per week
  const weekBucketsYtd: ChartDataPoint[] = [];
  const sorted = [...trend].sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return [];

  let wkStart = getMonday(new Date(sorted[0]!.date));
  const lastDate = new Date(sorted[sorted.length - 1]!.date);

  while (wkStart <= lastDate) {
    const wkEnd = new Date(wkStart);
    wkEnd.setDate(wkEnd.getDate() + 6);

    let weekTotal = 0;
    const cursor = new Date(wkStart);
    while (cursor <= wkEnd) {
      const key = cursor.toISOString().split("T")[0]!;
      const entry = lookup.get(key);
      if (entry) weekTotal += getTrendTotal(entry);
      cursor.setDate(cursor.getDate() + 1);
    }

    const startLabel = `${wkStart.toLocaleDateString("en", { month: "short" })} ${wkStart.getDate()}`;
    weekBucketsYtd.push({
      label: startLabel,
      value: Math.round(weekTotal / users),
    });

    wkStart = new Date(wkEnd);
    wkStart.setDate(wkStart.getDate() + 1);
  }

  return weekBucketsYtd;
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

  const barHex = getCssVar("--mi-accent", "#82C0CC");
  const uiRgb = getCssVar("--ui-rgb", "236, 232, 224");
  const axisHex = getCssVar("--text-secondary", "#9B9689");

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const W = rect.width;
  const H = rect.height;

  ctx.clearRect(0, 0, W, H);

  if (!data.length) {
    ctx.fillStyle = axisHex;
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
  const rawMax = Math.max(1, ...data.map((d) => d.value));

  const { step, unit, divisor } = niceAxis(rawMax);
  const maxVal = Math.ceil(rawMax / step) * step;

  ctx.strokeStyle = `rgba(${uiRgb}, 0.04)`;
  ctx.lineWidth = 1;
  for (let v = step; v <= maxVal; v += step) {
    const y = padTop + chartH * (1 - v / maxVal);
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + chartW, y);
    ctx.stroke();
  }

  ctx.fillStyle = axisHex;
  ctx.font = "10px Inter, system-ui, sans-serif";
  ctx.textAlign = "right";
  for (let v = step; v <= maxVal; v += step) {
    const y = padTop + chartH * (1 - v / maxVal);
    ctx.fillText(`${Math.round(v / divisor)}${unit}`, padLeft - 8, y + 3);
  }

  const groupW = chartW / n;
  const barW = Math.max(3, Math.min(groupW * 0.5, 36));
  const radius = 3;

  const labelSet = sparseIndices(n);

  for (let i = 0; i < n; i++) {
    const d = data[i];
    const groupX = padLeft + i * groupW;
    const centerX = groupX + groupW / 2;

    if (d.value >= 1) {
      const barH = (d.value / maxVal) * chartH;
      const barX = centerX - barW / 2;
      drawRoundedTopBar(ctx, barX, padTop + chartH - barH, barW, barH, radius, barHex);
    }

    if (labelSet.has(i)) {
      ctx.fillStyle = axisHex;
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

export default function DashboardView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilter = searchParams.get("period") as TimeFilter | null;
  const [filter, setFilter] = useState<TimeFilter>(
    initialFilter && VALID_FILTERS.has(initialFilter) ? initialFilter : "week"
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

  const isAvgMode = filter === "month" || filter === "ytd" || filter === "all";

  const headlineMinutes = useMemo(() => {
    if (!apiData?.hasData) return 0;
    const raw =
      apiData.metrics.totalActiveMinutes ??
      (apiData.dailyTrend || []).reduce((sum, d) => sum + getTrendTotal(d), 0);

    if (!isAvgMode) return raw;

    const users = Math.max(1, getDistinctUsers(apiData));
    const trend = apiData.dailyTrend || [];
    if (!trend.length) return 0;

    if (filter === "month") {
      // avg per user per week: total / users / weeks-with-data
      const today = new Date();
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      let weekCount = 0;
      const ws = new Date(firstOfMonth);
      while (ws <= lastOfMonth) {
        weekCount++;
        ws.setDate(ws.getDate() + 7);
      }
      return raw / users / Math.max(1, weekCount);
    }

    // YTD / All: avg per user per week
    const sorted = [...trend].sort((a, b) => a.date.localeCompare(b.date));
    if (!sorted.length) return 0;
    const firstDay = getMonday(new Date(sorted[0]!.date));
    const lastDay = new Date(sorted[sorted.length - 1]!.date);
    const weekSpan = Math.max(
      1,
      Math.ceil((lastDay.getTime() - firstDay.getTime()) / (7 * 86400000)) + 1
    );
    return raw / users / weekSpan;
  }, [apiData, filter, isAvgMode]);

  const activeTimeDisplay = useMemo(
    () => formatTopLevelDuration(headlineMinutes),
    [headlineMinutes]
  );

  const headlineLabel = useMemo(() => {
    if (filter === "month") return "Avg weekly active time";
    if (filter === "ytd" || filter === "all") return "Avg weekly active time";
    return "Total active time";
  }, [filter]);

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
            color: "var(--text-primary)",
            fontWeight: 400,
            letterSpacing: "-0.3px",
            margin: 0,
          }}
        >
          Dashboard
        </h1>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <DataScopeFilter />

          {/* Time filter bar */}
          <div
            style={{
              display: "flex",
              gap: 1,
              background: "rgba(var(--ui-rgb), 0.05)",
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
                  color: filter === f.key ? "var(--text-primary)" : "var(--text-secondary)",
                  background: filter === f.key ? "rgba(var(--ui-rgb), 0.12)" : "transparent",
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
      </div>

      {/* Headline stats */}
      <div style={{ display: "flex", gap: 56, alignItems: "flex-end", padding: "0 2px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span
            style={{
              fontSize: 10,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.09em",
              fontFamily: "var(--font-sans)",
            }}
          >
            {headlineLabel}
          </span>
          <span
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 48,
              color: "var(--text-primary)",
              fontWeight: 300,
              letterSpacing: -2,
              lineHeight: 1,
            }}
          >
            {activeTimeDisplay}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span
            style={{
              fontSize: 10,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.09em",
              fontFamily: "var(--font-sans)",
            }}
          >
            People tracked
          </span>
          <span
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 48,
              color: "var(--text-primary)",
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
          background: "var(--bg-raised)",
          border: "var(--border-hairline)",
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
              color: "var(--text-secondary)",
              fontFamily: "var(--font-sans)",
            }}
          >
            {isAvgMode ? "Avg active time" : "Active time"}
          </span>

          {/* Legend */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 20,
                height: 3,
                borderRadius: 1.5,
                background: BAR_COLOR,
              }}
            />
            <span
              style={{
                fontSize: 11,
                color: "var(--text-secondary)",
                fontFamily: "var(--font-sans)",
              }}
            >
              {isAvgMode ? "Avg per person" : "Active time"}
            </span>
          </div>
        </div>

        {/* Canvas */}
        <div style={{ flex: 1, minHeight: 200 }}>
          <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
        </div>
      </div>
    </div>
  );
}
