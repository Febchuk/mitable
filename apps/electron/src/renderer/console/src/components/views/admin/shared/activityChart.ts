export type ActivityTimeFilter = "yesterday" | "week" | "month" | "ytd" | "all";

export interface ActivityTrendEntry {
  date: string;
  workMinutes: number;
  meetingMinutes: number;
}

export interface ActivityChartDataPoint {
  label: string;
  value: number;
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

export const BAR_COLOR = "var(--mi-accent)";
export const AXIS_COLOR = "var(--text-secondary)";

function formatHour(h: number): string {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

const HOUR_WEIGHTS = [
  0.02, 0.01, 0.01, 0.01, 0.01, 0.02, 0.03, 0.05, 0.07, 0.1, 0.12, 0.13, 0.12, 0.08, 0.11, 0.1,
  0.09, 0.07, 0.04, 0.03, 0.02, 0.02, 0.01, 0.01,
];

function getMonday(d: Date): Date {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - diff);
  return date;
}

function entryTotal(e: ActivityTrendEntry): number {
  return e.workMinutes + e.meetingMinutes;
}

export function buildActivityChartData(
  trend: ActivityTrendEntry[],
  filter: ActivityTimeFilter
): ActivityChartDataPoint[] {
  if (!trend.length) return [];

  const lookup = new Map(trend.map((d) => [d.date, d]));

  if (filter === "yesterday") {
    const entry = trend[0];
    if (!entry) return [];
    const totalW = HOUR_WEIGHTS.reduce((a, b) => a + b, 0);
    const total = entryTotal(entry);
    return HOUR_WEIGHTS.map((w, i) => ({
      label: formatHour(i),
      value: Math.max(0, Math.round((total * w) / totalW)),
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
        value: entry ? Math.round(entryTotal(entry)) : 0,
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

    const weekBuckets: ActivityChartDataPoint[] = [];
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
        if (entry) weekTotal += entryTotal(entry);
        cursor.setDate(cursor.getDate() + 1);
      }

      const startLabel = `${weekStart.toLocaleDateString("en", { month: "short" })} ${weekStart.getDate()}`;
      const endLabel =
        clampedEnd.getMonth() === weekStart.getMonth()
          ? `${clampedEnd.getDate()}`
          : `${clampedEnd.toLocaleDateString("en", { month: "short" })} ${clampedEnd.getDate()}`;

      weekBuckets.push({
        label: `${startLabel}–${endLabel}`,
        value: Math.round(weekTotal),
      });

      weekStart = new Date(clampedEnd);
      weekStart.setDate(weekStart.getDate() + 1);
    }

    return weekBuckets;
  }

  // YTD and All — monthly buckets
  const buckets = new Map<string, { total: number; label: string }>();
  for (const d of trend) {
    const date = new Date(d.date);
    const key = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, "0")}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.total += entryTotal(d);
    } else {
      buckets.set(key, {
        total: entryTotal(d),
        label: date.toLocaleDateString("en", { month: "short" }),
      });
    }
  }

  return [...buckets.values()].map((b) => ({
    label: b.label,
    value: Math.round(b.total),
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
