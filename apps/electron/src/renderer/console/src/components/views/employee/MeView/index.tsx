import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Search,
  Video,
  X,
  Monitor,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, type TooltipProps } from "recharts";
import {
  useMyActivity,
  useMyDrillDown,
  useMyCategoryActivities,
  useMySubscriberActivities,
} from "@/console/src/hooks/queries/my-activity";
import type {
  DashboardPeriod,
  DashboardPersonDetail as PersonDetailData,
} from "@/console/src/services/adminService";
import { DocEditor } from "@/console/src/components/editor";
import { useDocument } from "@/console/src/hooks/queries/documents";
import { getLocale } from "@/console/src/lib/date";
import DrillDownPanel from "../../admin/DashboardView/DrillDownPanel";
import ActivityBlock from "../CalendarView/ActivityBlock";
import type { WorkBlock } from "../CalendarView/types";
import {
  ACTIVITY_FILTERS,
  buildActivityChartData,
  drawActivityChart,
  DEEP_WORK_COLOR,
  MEETINGS_COLOR,
  type ActivityTimeFilter as TimeRange,
  type ActivityTrendEntry,
} from "../../admin/shared/activityChart";
import { formatTopLevelDuration } from "../../admin/shared/topLevelDuration";

// ── Constants ────────────────────────────────────────────────

const LABEL_TO_METRIC: Record<string, string> = {
  "Average Focus Time": "focus_time",
  "Time In Meetings": "meeting_load",
};

const FILTER_TO_PERIOD: Record<TimeRange, DashboardPeriod> = {
  yesterday: "yesterday",
  week: "week",
  month: "month",
  ytd: "ytd",
  all: "all",
};

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  yesterday: "Yesterday",
  week: "Week",
  month: "Month",
  ytd: "YTD",
  all: "All",
};

const CUSTOMER_COLORS = [
  "var(--mi-accent)",
  "var(--mi-accent-dark)",
  "var(--mi-accent-light)",
  "rgba(var(--mi-accent-rgb), 0.7)",
  "rgba(var(--mi-accent-rgb), 0.5)",
  "rgba(var(--mi-accent-rgb), 0.35)",
];

const BREAKDOWN_BAR_COLOR = "var(--mi-accent)";

const RECENT_WORK_PAGE_SIZE = 10;

// ── Types ────────────────────────────────────────────────────

type RecentWorkFilter = "all" | "block" | "meeting" | "doc";

interface RecentWorkDocItem {
  kind: "doc";
  id: string;
  title: string;
  preview: string;
  fullContent: string;
  date: string;
  time: string;
  docType?: string;
}

interface RecentWorkBlockItem {
  kind: "block" | "meeting";
  id: string;
  title: string;
  preview: string;
  date: string;
  time: string;
  durationMinutes: number;
  category?: string;
  subscriberName?: string;
  participants?: { name: string; email: string }[];
  block: WorkBlock;
  blockNumber: number;
  source?: "granola" | "fireflies" | "session";
}

type RecentWorkItem = RecentWorkDocItem | RecentWorkBlockItem;

interface PersonViewModel {
  metrics: Array<{ label: string; value: string }>;
  activities: Array<{ id: string; label: string; minutes: number; hours: number }>;
  chartEntries: ActivityTrendEntry[];
  customerBreakdown: Array<{ label: string; value: number; hours: number; color: string }>;
  recentWork: RecentWorkItem[];
}

type CustomerTooltipPayload = {
  label: string;
  value: number;
  hours: number;
};

// ── Helpers ──────────────────────────────────────────────────

function toPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[*_~`]/g, "")
    .replace(/^[-•]\s+/gm, "")
    .replace(/\n+/g, " ")
    .trim();
}

function formatHours(minutes: number): string {
  return formatTopLevelDuration(minutes);
}

function formatCompactDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

function formatDateLabel(input: string): string {
  return new Date(input).toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatTimeLabel(input: string): string {
  return new Date(input).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function buildAppBreakdown(apps: string[] | null | undefined, durationMinutes: number) {
  const normalized = (apps || []).filter((app): app is string => Boolean(app));
  if (!normalized.length || durationMinutes <= 0) return [];

  const base = Math.floor(durationMinutes / normalized.length);
  const remainder = durationMinutes - base * normalized.length;

  return normalized.map((app, index) => {
    const minutes = base + (index < remainder ? 1 : 0);
    return {
      app,
      minutes,
      percentage: Math.max(1, Math.round((minutes / durationMinutes) * 100)),
    };
  });
}

function createWorkBlockFromActivityBlock(block: PersonDetailData["blocks"][number]): {
  block: WorkBlock;
  blockNumber: number;
} {
  return {
    block: {
      id: block.id,
      startTime: new Date(block.startTime),
      endTime: block.endTime ? new Date(block.endTime) : null,
      duration: block.durationMinutes,
      idleGapBefore: null,
      summary: block.description || "",
      captures: [],
      appBreakdown: buildAppBreakdown(block.apps, block.durationMinutes),
      taskBreakdown: [],
      name: block.name || `Block ${block.sequenceNumber}`,
      status: "ready",
    },
    blockNumber: block.sequenceNumber || 1,
  };
}

function buildTrendEntries(api: PersonDetailData): ActivityTrendEntry[] {
  const hasDailyTotals = api.dailyActivities.some(
    (day) => day.totalWorkMinutes > 0 || day.totalMeetingMinutes > 0
  );

  if (hasDailyTotals) {
    return [...api.dailyActivities].reverse().map((day) => ({
      date: day.date,
      workMinutes: day.totalWorkMinutes,
      meetingMinutes: day.totalMeetingMinutes,
    }));
  }

  const totalsByDate = new Map<string, { workMinutes: number; meetingMinutes: number }>();
  for (const block of api.blocks) {
    const key = new Date(block.startTime).toISOString().split("T")[0]!;
    const existing = totalsByDate.get(key) || { workMinutes: 0, meetingMinutes: 0 };
    if (block.type === "meeting") {
      existing.meetingMinutes += block.durationMinutes;
    } else {
      existing.workMinutes += block.durationMinutes;
    }
    totalsByDate.set(key, existing);
  }

  return [...totalsByDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, totals]) => ({
      date,
      workMinutes: totals.workMinutes,
      meetingMinutes: totals.meetingMinutes,
    }));
}

function transformApiToPersonViewModel(api: PersonDetailData, range: TimeRange): PersonViewModel {
  const daysTracked = api.summary.daysTracked || 1;
  const divisor = range === "yesterday" ? 1 : daysTracked;

  let effectiveWorkMinutes = api.summary.totalWorkMinutes;
  let effectiveMeetingMinutes = api.summary.totalMeetingMinutes;
  let effectiveActiveMinutes = api.summary.totalActiveMinutes;

  if (
    effectiveWorkMinutes === 0 &&
    effectiveMeetingMinutes === 0 &&
    effectiveActiveMinutes === 0 &&
    api.blocks.length > 0
  ) {
    for (const block of api.blocks) {
      if (block.type === "meeting") {
        effectiveMeetingMinutes += block.durationMinutes;
      } else {
        effectiveWorkMinutes += block.durationMinutes;
      }
    }
    effectiveActiveMinutes = effectiveWorkMinutes + effectiveMeetingMinutes;
  }

  const categoryMinutes = new Map<string, number>();
  for (const day of api.dailyActivities) {
    for (const entry of (day.categoryBreakdown || []) as { category: string; minutes: number }[]) {
      categoryMinutes.set(
        entry.category,
        (categoryMinutes.get(entry.category) || 0) + entry.minutes
      );
    }
  }

  if (categoryMinutes.size === 0) {
    for (const block of api.blocks) {
      if (!block.category) continue;
      categoryMinutes.set(
        block.category,
        (categoryMinutes.get(block.category) || 0) + block.durationMinutes
      );
    }
  }

  const activities = [...categoryMinutes.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([category, minutes]) => ({
      id: category.toLowerCase(),
      label: category.charAt(0).toUpperCase() + category.slice(1),
      minutes,
      hours: Math.round((minutes / 60) * 10) / 10,
    }));

  if (activities.length === 0) {
    activities.push(
      {
        id: "focus",
        label: "Focus",
        minutes: effectiveWorkMinutes,
        hours: Math.round((effectiveWorkMinutes / 60) * 10) / 10,
      },
      {
        id: "meetings",
        label: "Meetings",
        minutes: effectiveMeetingMinutes,
        hours: Math.round((effectiveMeetingMinutes / 60) * 10) / 10,
      }
    );
  }

  const subscriberMinutes = new Map<string, number>();
  if (api.subscriberDistribution?.length) {
    for (const entry of api.subscriberDistribution) {
      subscriberMinutes.set(entry.subscriberName, entry.totalMinutes);
    }
  } else {
    for (const day of api.dailyActivities) {
      for (const entry of (day.subscriberBreakdown || []) as {
        subscriberName: string;
        minutes: number;
      }[]) {
        if (!entry.subscriberName) continue;
        subscriberMinutes.set(
          entry.subscriberName,
          (subscriberMinutes.get(entry.subscriberName) || 0) + entry.minutes
        );
      }
    }
  }

  const totalCustomerMinutes = [...subscriberMinutes.values()].reduce(
    (sum, value) => sum + value,
    0
  );
  const customerBreakdown = [...subscriberMinutes.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, minutes], index) => ({
      label,
      value: totalCustomerMinutes > 0 ? Math.round((minutes / totalCustomerMinutes) * 100) : 0,
      hours: Math.round((minutes / 60) * 10) / 10,
      color: CUSTOMER_COLORS[index % CUSTOMER_COLORS.length] || CUSTOMER_COLORS[0]!,
    }));

  const recentWork: RecentWorkItem[] = [];

  for (const block of [...api.blocks].sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  )) {
    if (block.type !== "work") continue;
    if (block.description === "Unclassified session." && block.category === "other") continue;

    const adapted = createWorkBlockFromActivityBlock(block);
    const previewSource =
      block.description ||
      (block.apps?.length ? `Worked across ${block.apps.join(", ")}` : block.name || "");

    recentWork.push({
      kind: "block",
      id: block.id,
      title: block.name || `Block ${block.sequenceNumber}`,
      preview: toPlainText(previewSource),
      date: formatDateLabel(block.startTime),
      time: formatTimeLabel(block.startTime),
      durationMinutes: block.durationMinutes,
      category: block.category || undefined,
      block: adapted.block,
      blockNumber: adapted.blockNumber,
    });
  }

  for (const doc of api.documents) {
    recentWork.push({
      kind: "doc",
      id: doc.id,
      title: doc.title,
      preview: toPlainText(doc.content || doc.description || ""),
      fullContent: doc.content,
      date: formatDateLabel(doc.createdAt),
      time: formatTimeLabel(doc.createdAt),
      docType: doc.docType,
    });
  }

  recentWork.sort((a, b) => {
    const dateA = new Date(`${a.date} ${a.time}`).getTime();
    const dateB = new Date(`${b.date} ${b.time}`).getTime();
    return dateB - dateA;
  });

  return {
    metrics: [
      {
        label: "Average Focus Time",
        value: formatHours(effectiveWorkMinutes / divisor),
      },
      {
        label: "Time In Meetings",
        value: formatHours(effectiveMeetingMinutes / divisor),
      },
    ],
    activities,
    chartEntries: buildTrendEntries(api),
    customerBreakdown,
    recentWork,
  };
}

// ── Sub-components ───────────────────────────────────────────

function RecentWorkIcon({ kind }: { kind: RecentWorkFilter }) {
  const icon =
    kind === "doc" ? (
      <FileText size={18} />
    ) : kind === "meeting" ? (
      <Video size={18} />
    ) : (
      <Monitor size={18} />
    );

  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        border: "var(--border-subtle)",
        background: "rgba(var(--ui-rgb), 0.04)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-secondary)",
        flexShrink: 0,
      }}
    >
      {icon}
    </div>
  );
}

function CustomerWorkTooltip({ active, payload }: TooltipProps<number, string>) {
  const entry = payload?.[0]?.payload as CustomerTooltipPayload | undefined;
  if (!active || !entry) return null;

  return (
    <div className="bg-canvas-overlay border border-stroke-subtle rounded-lg px-3 py-2 text-xs shadow-lg">
      <span className="text-text-primary font-medium">{entry.label}</span>
      <span className="text-text-secondary ml-2">
        {entry.hours}h ({entry.value}%)
      </span>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────

export default function MeView() {
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [drillDownMetric, setDrillDownMetric] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubscriber, setSelectedSubscriber] = useState<string | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedWork, setSelectedWork] = useState<RecentWorkBlockItem | null>(null);
  const [workFilter, setWorkFilter] = useState<RecentWorkFilter>("all");
  const [workSearchQuery, setWorkSearchQuery] = useState("");
  const [workPage, setWorkPage] = useState(0);

  // Reset to first page when filter or search changes
  useEffect(() => {
    setWorkPage(0);
  }, [workFilter, workSearchQuery]);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { data: apiDetail } = useMyActivity(FILTER_TO_PERIOD[timeRange]);
  const { data: drillDownData } = useMyDrillDown(drillDownMetric, FILTER_TO_PERIOD[timeRange]);
  const { data: categoryData } = useMyCategoryActivities(
    selectedCategory,
    FILTER_TO_PERIOD[timeRange]
  );
  const { data: subscriberData } = useMySubscriberActivities(
    selectedSubscriber,
    FILTER_TO_PERIOD[timeRange]
  );
  const { data: docData, isLoading: docLoading } = useDocument(selectedDocId || "");

  const handleDrillDown = (label: string) => {
    const metricKey = LABEL_TO_METRIC[label] || label.toLowerCase();
    if (LABEL_TO_METRIC[label]) {
      setSelectedCategory(null);
      setDrillDownMetric(metricKey);
    } else {
      setDrillDownMetric(null);
      setSelectedCategory(metricKey);
    }
  };

  const closeDrillDown = () => {
    setDrillDownMetric(null);
    setSelectedCategory(null);
    setSelectedSubscriber(null);
  };

  const person = useMemo(() => {
    if (!apiDetail) return null;
    return transformApiToPersonViewModel(apiDetail, timeRange);
  }, [apiDetail, timeRange]);

  const chartData = useMemo(() => {
    if (!person) return [];
    return buildActivityChartData(person.chartEntries, timeRange);
  }, [person, timeRange]);

  useEffect(() => {
    if (!canvasRef.current) return;
    drawActivityChart(canvasRef.current, chartData);
  }, [chartData]);

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        drawActivityChart(canvasRef.current, chartData);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [chartData]);

  // ── Doc view ──────────────────────────────────────────────

  if (selectedDocId) {
    const docTypeLabels: Record<string, string> = {
      "how-to": "How-To Guide",
      "knowledge-article": "Knowledge Article",
      troubleshooting: "Troubleshooting Guide",
    };

    return (
      <div className="h-screen flex flex-col">
        <div className="flex items-start justify-between p-6 border-b border-border-subtle">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSelectedDocId(null)}
              className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-canvas-overlay transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-canvas-overlay flex items-center justify-center">
                <FileText size={20} className="text-text-secondary" />
              </div>
              <div>
                {docLoading ? (
                  <div className="h-5 w-48 bg-canvas-overlay rounded animate-pulse" />
                ) : (
                  <>
                    <h2 className="text-xl font-bold text-text-primary">
                      {docData?.title || "Document"}
                    </h2>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-text-secondary text-sm">
                        {docTypeLabels[docData?.docType || ""] || docData?.docType}
                      </span>
                      {docData?.status && (
                        <span className="text-[10px] text-text-secondary bg-canvas-overlay px-2 py-1 rounded-full uppercase tracking-[0.08em]">
                          {docData.status}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          <span className="text-xs text-text-tertiary px-3 py-1 rounded-full bg-canvas-overlay">
            View only
          </span>
        </div>

        {docData && (
          <div className="flex items-center gap-6 text-sm px-6 py-3 border-b border-border-subtle bg-background-secondary/30">
            <div className="flex items-center gap-2 text-text-secondary">
              <Calendar size={14} />
              <span>
                Updated:{" "}
                <span className="text-text-primary">
                  {new Date(docData.updatedAt).toLocaleDateString(getLocale(), {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </span>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto bg-background-primary">
          {docLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <div className="max-w-4xl mx-auto px-8 py-6">
              <DocEditor
                key={selectedDocId}
                initialContent={docData?.content || ""}
                readOnly
                placeholder=""
                className="h-full"
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Work block detail view ────────────────────────────────

  if (selectedWork) {
    return (
      <div style={{ height: "100vh", overflowY: "auto", padding: "32px 36px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <button
            onClick={() => setSelectedWork(null)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "none",
              border: "none",
              padding: 0,
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            <ArrowLeft size={15} />
            Back to Recent Work
          </button>

          <div>
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
              {selectedWork.title}
            </h1>
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--text-tertiary)" }}>
              {selectedWork.date}, {selectedWork.time}
              {selectedWork.durationMinutes > 0
                ? ` · ${formatCompactDuration(selectedWork.durationMinutes)}`
                : ""}
            </p>
          </div>

          <div>
            <div
              style={{
                fontSize: 10,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 10,
              }}
            >
              {selectedWork.kind === "meeting" ? "Meetings" : "Activity"}
            </div>
            <ActivityBlock
              block={selectedWork.block}
              blockNumber={selectedWork.blockNumber}
              defaultExpanded
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Empty / loading state ────────────────────────────────

  if (!person) {
    return (
      <div style={{ height: "100vh", overflowY: "auto", padding: "32px 36px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 20,
            marginBottom: 32,
          }}
        >
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
            My Activity
          </h1>
        </div>

        <div style={{ textAlign: "center", padding: "120px 0" }}>
          <p style={{ fontSize: 15, color: "var(--text-secondary)", margin: 0 }}>
            No activity data yet
          </p>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "8px 0 0" }}>
            Your activity metrics will appear here as you work.
          </p>
        </div>
      </div>
    );
  }

  // ── Main view ────────────────────────────────────────────

  const totalActivityMinutes = person.activities.reduce((sum, entry) => sum + entry.minutes, 0);
  const showCustomerWork = person.customerBreakdown.length > 0;

  const filteredRecentWork = person.recentWork.filter((item) => {
    const query = workSearchQuery.trim().toLowerCase();
    const matchesFilter =
      workFilter === "all" ||
      (workFilter === "doc" && item.kind === "doc") ||
      (workFilter === "meeting" && item.kind === "meeting") ||
      (workFilter === "block" && item.kind === "block");

    const matchesQuery =
      !query ||
      item.title.toLowerCase().includes(query) ||
      item.preview.toLowerCase().includes(query) ||
      ("category" in item && item.category ? item.category.toLowerCase().includes(query) : false) ||
      ("subscriberName" in item && item.subscriberName
        ? item.subscriberName.toLowerCase().includes(query)
        : false);

    return matchesFilter && matchesQuery;
  });

  const totalWorkPages = Math.ceil(filteredRecentWork.length / RECENT_WORK_PAGE_SIZE);
  const paginatedWork = filteredRecentWork.slice(
    workPage * RECENT_WORK_PAGE_SIZE,
    (workPage + 1) * RECENT_WORK_PAGE_SIZE
  );

  return (
    <div className="relative h-screen overflow-hidden">
      <div
        style={{
          height: "100%",
          overflowY: "auto",
          padding: "32px 36px",
          display: "flex",
          flexDirection: "column",
          gap: 32,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 20,
          }}
        >
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
            My Activity
          </h1>

          {/* Time range filter */}
          <div
            style={{
              display: "flex",
              gap: 1,
              background: "rgba(var(--ui-rgb), 0.05)",
              borderRadius: 7,
              padding: 3,
              flexShrink: 0,
            }}
          >
            {ACTIVITY_FILTERS.map((filter) => (
              <button
                key={filter.key}
                onClick={() => setTimeRange(filter.key)}
                style={{
                  padding: "4px 12px",
                  borderRadius: 5,
                  fontSize: 11,
                  fontFamily: "var(--font-sans)",
                  color: timeRange === filter.key ? "var(--text-primary)" : "var(--text-secondary)",
                  background: timeRange === filter.key ? "var(--bg-overlay)" : "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {/* Metrics — big numbers */}
        <div style={{ display: "flex", gap: 56, alignItems: "flex-end", padding: "0 2px" }}>
          {person.metrics.map((metric) => (
            <button
              key={metric.label}
              onClick={() => handleDrillDown(metric.label)}
              style={{
                textAlign: "left",
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
            >
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
                  {metric.label}
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
                  {metric.value}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Customer Work + Activity Breakdown */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: showCustomerWork
              ? "minmax(0, 1fr) minmax(0, 1fr)"
              : "minmax(0, 1fr)",
            gap: 16,
          }}
        >
          {showCustomerWork && (
            <div
              style={{
                background: "var(--bg-raised)",
                border: "var(--border-hairline)",
                borderRadius: 12,
                padding: "22px 24px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginBottom: 18,
                  gap: 12,
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
                  Customer Work
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 24, minHeight: 180 }}>
                <div style={{ width: 156, height: 156, flexShrink: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={person.customerBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={44}
                        outerRadius={70}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {person.customerBreakdown.map((entry, index) => (
                          <Cell
                            key={entry.label}
                            fill={entry.color || CUSTOMER_COLORS[index % CUSTOMER_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomerWorkTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    maxHeight: 220,
                    overflowY: "auto",
                  }}
                >
                  {person.customerBreakdown.map((entry) => (
                    <button
                      key={entry.label}
                      onClick={() => {
                        setDrillDownMetric(null);
                        setSelectedCategory(null);
                        setSelectedSubscriber(entry.label);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        width: "100%",
                        padding: "8px 0",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <div
                          style={{
                            width: 16,
                            height: 3,
                            borderRadius: 999,
                            background: entry.color,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontSize: 13,
                            color: "var(--text-primary)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {entry.label}
                        </span>
                      </div>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)", flexShrink: 0 }}>
                        {entry.hours}h ({entry.value}%)
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Activity Breakdown */}
          <div
            style={{
              background: "var(--bg-raised)",
              border: "var(--border-hairline)",
              borderRadius: 12,
              padding: "22px 24px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: 18,
                gap: 12,
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
                Activity Breakdown
              </span>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                maxHeight: 232,
                overflowY: "auto",
                paddingRight: 4,
              }}
            >
              {person.activities.map((activity) => {
                const percentage =
                  totalActivityMinutes > 0
                    ? Math.round((activity.minutes / totalActivityMinutes) * 100)
                    : 0;
                return (
                  <button
                    key={activity.id}
                    onClick={() => handleDrillDown(activity.label)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      width: "100%",
                      minWidth: 0,
                      padding: 0,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span
                      style={{
                        flex: "0 1 120px",
                        minWidth: 0,
                        fontSize: 13,
                        color: "var(--text-secondary)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {activity.label}
                    </span>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            height: 3,
                            borderRadius: 999,
                            background: "rgba(var(--ui-rgb), 0.06)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${percentage}%`,
                              height: "100%",
                              borderRadius: 999,
                              background: BREAKDOWN_BAR_COLOR,
                            }}
                          />
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          flexShrink: 0,
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--text-tertiary)",
                            textAlign: "right",
                          }}
                        >
                          {formatCompactDuration(activity.minutes)}
                        </span>
                        <span
                          style={{
                            minWidth: 34,
                            fontSize: 11,
                            color: "var(--text-tertiary)",
                            textAlign: "right",
                          }}
                        >
                          {percentage}%
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Active Time chart */}
        <div
          style={{
            background: "var(--bg-raised)",
            border: "var(--border-hairline)",
            borderRadius: 12,
            padding: "22px 24px 16px",
            minHeight: 320,
            display: "flex",
            flexDirection: "column",
          }}
        >
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
              Active Time
            </span>
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
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Deep work</span>
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
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Meetings</span>
              </div>
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 240 }}>
            <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
          </div>
        </div>

        {/* Recent Work */}
        <div
          style={{
            background: "var(--bg-raised)",
            border: "var(--border-hairline)",
            borderRadius: 12,
            padding: "22px 24px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 18 }}>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--font-serif)",
                fontSize: 24,
                fontWeight: 400,
                color: "var(--text-primary)",
                letterSpacing: "-0.2px",
              }}
            >
              Recent Work
            </h2>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
              }}
            >
              {/* Search */}
              <div style={{ position: "relative", flex: 1, maxWidth: 340 }}>
                <Search
                  size={14}
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text-tertiary)",
                    pointerEvents: "none",
                  }}
                />
                <input
                  type="text"
                  value={workSearchQuery}
                  onChange={(e) => setWorkSearchQuery(e.target.value)}
                  placeholder="Filter by title, category, or customer..."
                  style={{
                    width: "100%",
                    height: 36,
                    padding: "0 34px 0 34px",
                    borderRadius: 8,
                    border: "var(--border-subtle)",
                    background: "var(--bg-base)",
                    color: "var(--text-primary)",
                    fontSize: 12,
                    outline: "none",
                  }}
                />
                {workSearchQuery ? (
                  <button
                    onClick={() => setWorkSearchQuery("")}
                    style={{
                      position: "absolute",
                      right: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      border: "none",
                      background: "none",
                      padding: 0,
                      color: "var(--text-tertiary)",
                      cursor: "pointer",
                    }}
                  >
                    <X size={12} />
                  </button>
                ) : null}
              </div>

              {/* Work filter tabs */}
              <div
                style={{
                  display: "flex",
                  gap: 1,
                  background: "rgba(var(--ui-rgb), 0.05)",
                  borderRadius: 7,
                  padding: 3,
                  flexShrink: 0,
                }}
              >
                {(
                  [
                    { key: "all", label: "All" },
                    { key: "block", label: "Blocks" },
                    { key: "meeting", label: "Meetings" },
                    { key: "doc", label: "Docs" },
                  ] as Array<{ key: RecentWorkFilter; label: string }>
                ).map((filter) => {
                  const count =
                    filter.key === "all"
                      ? person.recentWork.length
                      : person.recentWork.filter((item) => item.kind === filter.key).length;

                  return (
                    <button
                      key={filter.key}
                      onClick={() => setWorkFilter(filter.key)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 5,
                        fontSize: 11,
                        color:
                          workFilter === filter.key
                            ? "var(--text-primary)"
                            : "var(--text-secondary)",
                        background: workFilter === filter.key ? "var(--bg-overlay)" : "transparent",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      {filter.label}
                      {count > 0 ? ` (${count})` : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Work items */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filteredRecentWork.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  padding: "16px 0",
                  fontSize: 13,
                  color: "var(--text-tertiary)",
                  textAlign: "center",
                }}
              >
                {workSearchQuery
                  ? `No results for "${workSearchQuery}"`
                  : "No recent work for this view"}
              </p>
            ) : (
              paginatedWork.map((item) => (
                <button
                  key={`${item.kind}-${item.id}`}
                  onClick={() =>
                    item.kind === "doc"
                      ? setSelectedDocId(item.id)
                      : setSelectedWork(item as RecentWorkBlockItem)
                  }
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 14,
                    padding: "14px 0",
                    background: "none",
                    border: "none",
                    borderTop: "var(--border-hairline)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <RecentWorkIcon
                    kind={
                      item.kind === "doc" ? "doc" : item.kind === "meeting" ? "meeting" : "block"
                    }
                  />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>
                        {item.title}
                      </span>
                      {item.kind === "meeting" ? (
                        <span
                          style={{
                            fontSize: 10,
                            color: "var(--text-secondary)",
                            background: "rgba(var(--ui-rgb), 0.06)",
                            borderRadius: 999,
                            padding: "3px 8px",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Meeting
                        </span>
                      ) : null}
                    </div>

                    {item.kind !== "doc" && item.preview && (
                      <p
                        style={{
                          margin: "6px 0 0",
                          fontSize: 12,
                          color: "var(--text-secondary)",
                          lineHeight: 1.5,
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {item.preview}
                      </p>
                    )}

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                        marginTop: 8,
                      }}
                    >
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                        {item.date}, {item.time}
                      </span>
                      {"durationMinutes" in item ? (
                        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                          {formatCompactDuration(item.durationMinutes)}
                        </span>
                      ) : null}
                      {"category" in item && item.category ? (
                        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                          {item.category}
                        </span>
                      ) : null}
                      {"subscriberName" in item && item.subscriberName ? (
                        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                          {item.subscriberName}
                        </span>
                      ) : null}
                      {"docType" in item && item.docType ? (
                        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                          {item.docType}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Pagination */}
          {totalWorkPages > 1 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: 14,
                borderTop: "var(--border-hairline)",
                marginTop: 6,
              }}
            >
              <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                {workPage * RECENT_WORK_PAGE_SIZE + 1}–
                {Math.min((workPage + 1) * RECENT_WORK_PAGE_SIZE, filteredRecentWork.length)} of{" "}
                {filteredRecentWork.length}
              </span>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  disabled={workPage === 0}
                  onClick={() => setWorkPage((p) => p - 1)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 30,
                    height: 30,
                    borderRadius: 6,
                    border: "var(--border-subtle)",
                    background: "var(--bg-base)",
                    color: workPage === 0 ? "var(--text-disabled)" : "var(--text-secondary)",
                    cursor: workPage === 0 ? "default" : "pointer",
                    opacity: workPage === 0 ? 0.4 : 1,
                  }}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  disabled={workPage >= totalWorkPages - 1}
                  onClick={() => setWorkPage((p) => p + 1)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 30,
                    height: 30,
                    borderRadius: 6,
                    border: "var(--border-subtle)",
                    background: "var(--bg-base)",
                    color:
                      workPage >= totalWorkPages - 1
                        ? "var(--text-disabled)"
                        : "var(--text-secondary)",
                    cursor: workPage >= totalWorkPages - 1 ? "default" : "pointer",
                    opacity: workPage >= totalWorkPages - 1 ? 0.4 : 1,
                  }}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Drill-down panels */}
      {drillDownMetric && drillDownData && (
        <div className="absolute top-0 right-0 h-full w-[420px] p-4 z-20">
          <DrillDownPanel data={drillDownData} onClose={closeDrillDown} />
        </div>
      )}

      {selectedSubscriber && (
        <div className="absolute top-0 right-0 h-full w-[420px] p-4 z-20">
          <div className="flex flex-col h-full rounded-xl border border-stroke-subtle bg-canvas-raised overflow-hidden">
            <div className="px-5 py-4 border-b border-stroke-subtle shrink-0">
              <div className="flex items-center justify-between">
                <button
                  onClick={closeDrillDown}
                  className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
                >
                  <ArrowLeft size={14} />
                  Back
                </button>
                <button
                  onClick={closeDrillDown}
                  className="p-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-canvas-overlay transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <h2 className="text-lg font-semibold text-text-primary mt-2">{selectedSubscriber}</h2>
              <p className="text-xs text-text-secondary mt-0.5">
                {subscriberData
                  ? `${subscriberData.totalHours}h across ${subscriberData.activityCount} activities · ${TIME_RANGE_LABELS[timeRange]}`
                  : "Loading..."}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {!subscriberData ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : subscriberData.activities.length === 0 ? (
                <p className="text-sm text-text-tertiary text-center py-12">
                  No activities for this customer in the selected period.
                </p>
              ) : (
                subscriberData.activities.map((act) => {
                  const date = new Date(act.startTime);
                  const duration = formatCompactDuration(act.durationMinutes);

                  return (
                    <div
                      key={act.id}
                      className="rounded-lg border border-stroke-subtle bg-canvas-overlay/50 p-3 hover:border-indigo/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-text-secondary bg-canvas-overlay">
                            <Video size={14} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-text-primary leading-snug">
                              {act.name}
                            </p>
                            {act.description && act.description !== act.name && (
                              <p className="text-xs text-text-secondary mt-0.5 line-clamp-2 leading-relaxed">
                                {act.description}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className="text-xs font-medium text-text-secondary whitespace-nowrap shrink-0">
                          {duration}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-2 ml-[38px]">
                        <span className="text-[10px] text-text-tertiary flex items-center gap-1">
                          <Clock size={10} />
                          {date.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                          ,{" "}
                          {date.toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </span>
                        {act.category && (
                          <span className="text-[9px] font-medium text-text-tertiary bg-canvas-overlay px-1.5 py-0.5 rounded">
                            {act.category}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {selectedCategory && (
        <div className="absolute top-0 right-0 h-full w-[420px] p-4 z-20">
          <div className="flex flex-col h-full rounded-xl border border-stroke-subtle bg-canvas-raised overflow-hidden">
            <div className="px-5 py-4 border-b border-stroke-subtle shrink-0">
              <div className="flex items-center justify-between">
                <button
                  onClick={closeDrillDown}
                  className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
                >
                  <ArrowLeft size={14} />
                  Back
                </button>
                <button
                  onClick={closeDrillDown}
                  className="p-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-canvas-overlay transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <h2 className="text-lg font-semibold text-text-primary mt-2 capitalize">
                {selectedCategory}
              </h2>
              <p className="text-xs text-text-secondary mt-0.5">
                {categoryData
                  ? `${categoryData.totalHours}h across ${categoryData.activityCount} activities · ${TIME_RANGE_LABELS[timeRange]}`
                  : "Loading..."}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {!categoryData ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : categoryData.activities.length === 0 ? (
                <p className="text-sm text-text-tertiary text-center py-12">
                  No activities in this category for the selected period.
                </p>
              ) : (
                categoryData.activities.map((act) => {
                  const date = new Date(act.startTime);
                  const duration = formatCompactDuration(act.durationMinutes);

                  return (
                    <div
                      key={act.id}
                      className="rounded-lg border border-stroke-subtle bg-canvas-overlay/50 p-3 hover:border-indigo/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-text-secondary bg-canvas-overlay">
                            <Video size={14} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-text-primary leading-snug">
                              {act.name}
                            </p>
                            {act.description && act.description !== act.name && (
                              <p className="text-xs text-text-secondary mt-0.5 line-clamp-2 leading-relaxed">
                                {act.description}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className="text-xs font-medium text-text-secondary whitespace-nowrap shrink-0">
                          {duration}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-2 ml-[38px]">
                        <span className="text-[10px] text-text-tertiary flex items-center gap-1">
                          <Clock size={10} />
                          {date.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                          ,{" "}
                          {date.toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
