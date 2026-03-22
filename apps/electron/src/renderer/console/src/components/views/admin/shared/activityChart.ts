export type ActivityTimeFilter = "yesterday" | "week" | "month" | "ytd" | "all";

export interface ActivityTrendEntry {
  date: string;
  workMinutes: number;
  meetingMinutes: number;
}

export interface ActivityChartDataPoint {
  label: string;
  deepWork: number;
  meetings: number;
}

export const ACTIVITY_FILTERS: { key: ActivityTimeFilter; label: string }[] = [
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "All" },
];

export const VALID_ACTIVITY_FILTERS = new Set<ActivityTimeFilter>([
  "yesterday",
  "week",
  "month",
  "ytd",
  "all",
]);

function getCssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export const DEEP_WORK_COLOR = "var(--mi-accent)";
export const MEETINGS_COLOR = "var(--mi-accent-dark)";
export const AXIS_COLOR = "#9B9689";

function formatHour(h: number): string {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

function shortDate(date: Date): string {
  return `${date.toLocaleDateString("en", { month: "short" })} ${date.getDate()}`;
}

const HOUR_WEIGHTS = [
  0.02, 0.01, 0.01, 0.01, 0.01, 0.02, 0.03, 0.05, 0.07, 0.1, 0.12, 0.13, 0.12, 0.08, 0.11, 0.1,
  0.09, 0.07, 0.04, 0.03, 0.02, 0.02, 0.01, 0.01,
];

export function buildActivityChartData(
  trend: ActivityTrendEntry[],
  filter: ActivityTimeFilter
): ActivityChartDataPoint[] {
  if (!trend.length) return [];

  if (filter === "yesterday") {
    const entry = trend[0];
    if (!entry) return [];
    const totalW = HOUR_WEIGHTS.reduce((a, b) => a + b, 0);
    return HOUR_WEIGHTS.map((w, i) => ({
      label: formatHour(i),
      deepWork: Math.max(0, Math.round((entry.workMinutes * w) / totalW)),
      meetings: Math.max(0, Math.round((entry.meetingMinutes * w) / totalW)),
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
        deepWork: entry ? Math.round(entry.workMinutes) : 0,
        meetings: entry ? Math.round(entry.meetingMinutes) : 0,
      };
    });
  }

  if (filter === "month") {
    return trend.map((d) => {
      const date = new Date(d.date);
      return {
        label: shortDate(date),
        deepWork: Math.round(d.workMinutes),
        meetings: Math.round(d.meetingMinutes),
      };
    });
  }

  const buckets = new Map<string, { deepWork: number; meetings: number; label: string }>();
  for (const d of trend) {
    const date = new Date(d.date);
    const key = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, "0")}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.deepWork += d.workMinutes;
      existing.meetings += d.meetingMinutes;
    } else {
      buckets.set(key, {
        deepWork: d.workMinutes,
        meetings: d.meetingMinutes,
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

function sparseIndices(n: number, maxLabels = 8): Set<number> {
  if (n <= maxLabels) {
    return new Set(Array.from({ length: n }, (_, i) => i));
  }
  const step = Math.ceil(n / maxLabels);
  const indices = new Set<number>();
  for (let i = 0; i < n; i += step) indices.add(i);
  return indices;
}

function niceAxis(rawMax: number): { step: number; unit: "m" | "h"; divisor: number } {
  if (rawMax <= 0) return { step: 15, unit: "m", divisor: 1 };

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

export function drawActivityChart(canvas: HTMLCanvasElement, data: ActivityChartDataPoint[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const deepWorkHex = getCssVar("--mi-accent", "#82C0CC");
  const meetingsHex = getCssVar("--mi-accent-dark", "#3A7A87");

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
  const { step, unit, divisor } = niceAxis(rawMax);
  const maxVal = Math.ceil(rawMax / step) * step;

  ctx.strokeStyle = "rgba(236, 232, 224, 0.04)";
  ctx.lineWidth = 1;
  for (let v = step; v <= maxVal; v += step) {
    const y = padTop + chartH * (1 - v / maxVal);
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + chartW, y);
    ctx.stroke();
  }

  ctx.fillStyle = AXIS_COLOR;
  ctx.font = "10px Inter, system-ui, sans-serif";
  ctx.textAlign = "right";
  for (let v = step; v <= maxVal; v += step) {
    const y = padTop + chartH * (1 - v / maxVal);
    ctx.fillText(`${Math.round(v / divisor)}${unit}`, padLeft - 8, y + 3);
  }

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
      drawRoundedTopBar(ctx, dwX, padTop + chartH - dwH, barW, dwH, radius, deepWorkHex);

      const mtH = (d.meetings / maxVal) * chartH;
      const mtX = centerX + gap / 2;
      drawRoundedTopBar(ctx, mtX, padTop + chartH - mtH, barW, mtH, radius, meetingsHex);
    } else if (!dwIsZero) {
      const dwH = (d.deepWork / maxVal) * chartH;
      const dwX = centerX - barW / 2;
      drawRoundedTopBar(ctx, dwX, padTop + chartH - dwH, barW, dwH, radius, deepWorkHex);
    } else if (!mtIsZero) {
      const mtH = (d.meetings / maxVal) * chartH;
      const mtX = centerX - barW / 2;
      drawRoundedTopBar(ctx, mtX, padTop + chartH - mtH, barW, mtH, radius, meetingsHex);
    }

    if (labelSet.has(i)) {
      ctx.fillStyle = AXIS_COLOR;
      ctx.font = "10px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(d.label, centerX, padTop + chartH + 16);
    }
  }
}
