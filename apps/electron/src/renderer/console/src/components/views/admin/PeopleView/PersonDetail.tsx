import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  FileText,
  Zap,
  Calendar,
  X,
  Clock,
  Briefcase,
  Edit,
  Check,
  Clipboard,
  Search,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  useDashboardPersonDetail,
  useUserDrillDown,
  useCategoryActivities,
} from "@/console/src/hooks/queries/admin";
import type {
  DashboardPeriod,
  DashboardPersonDetail as PersonDetailData,
} from "@/console/src/services/adminService";
import DrillDownPanel from "../DashboardView/DrillDownPanel";
import { DocEditor } from "@/console/src/components/editor";
import { useDocument } from "@/console/src/hooks/queries/documents";
import { updateSessionSummary, reviseSummary } from "@/console/src/services/monitoringService";
import AIEditPanel from "@/console/src/components/shared/AIEditPanel";
import { Badge } from "@/components/ui/badge";
import { getLocale } from "@/console/src/lib/date";

const LABEL_TO_METRIC: Record<string, string> = {
  "Avg Focus Time": "focus_time",
  "Active Time": "active_time",
  "Meeting Time": "meeting_load",
  "Days Tracked": "days_tracked",
};

interface RecentWorkItem {
  id: string;
  type: "session" | "doc";
  title: string;
  preview: string;
  fullContent: string;
  date: string;
  time: string;
  durationMinutes?: number;
  category?: string;
  docType?: string;
}

interface PersonViewModel {
  name: string;
  role: string;
  email: string;
  startDate: string;
  lastActive: string;
  mood: string;
  moodColor: string;
  metrics: { label: string; value: string; sub: string }[];
  activities: { id: string; label: string; hours: number; color: string }[];
  weeklyTrend: { day: string; focus: number; meetings: number; other: number }[];
  recentWork: RecentWorkItem[];
  topTopics: { label: string; count: number }[];
}

type TimeRange = "yesterday" | "week" | "month" | "ytd" | "all";

function truncateDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 6) / 10}h`;
}

const CATEGORY_COLORS: Record<string, string> = {
  development: "#6366F1",
  communication: "#F472B6",
  research: "#F59E0B",
  design: "#818CF8",
  review: "#34D399",
  documentation: "#60A5FA",
  other: "#A1A1A1",
};

function transformApiToPersonViewModel(api: PersonDetailData, range: TimeRange): PersonViewModel {
  const u = api.user;
  const s = api.summary;
  const days = s.daysTracked || 1;
  const isSingleDay = range === "yesterday";

  // For multi-day periods, show per-day averages; for single-day, show totals
  const divisor = isSingleDay ? 1 : days;

  // If dailyActivities time totals are all 0 but sessions exist, compute from session durations
  let effectiveWorkMin = s.totalWorkMinutes;
  let effectiveActiveMin = s.totalActiveMinutes;
  const effectiveMeetingMin = s.totalMeetingMinutes;

  if (effectiveWorkMin === 0 && effectiveActiveMin === 0 && api.sessionActivities?.length > 0) {
    const totalSessionMin = api.sessionActivities.reduce(
      (sum, sess) => sum + (sess.durationMinutes || 0),
      0
    );
    effectiveWorkMin = totalSessionMin;
    effectiveActiveMin = totalSessionMin;
  }

  const workHours = Math.round((effectiveWorkMin / 60 / divisor) * 10) / 10;
  const meetingHours = Math.round((effectiveMeetingMin / 60 / divisor) * 10) / 10;
  const activeHours = Math.round((effectiveActiveMin / 60 / divisor) * 10) / 10;

  const periodLabel = {
    yesterday: "yesterday",
    week: "this week",
    month: "this month",
    ytd: "year to date",
    all: "all time",
  }[range];
  const effectiveWorkPct =
    effectiveActiveMin > 0 ? Math.round((effectiveWorkMin / effectiveActiveMin) * 100) : 0;
  const effectiveMeetingPct =
    effectiveActiveMin > 0 ? Math.round((effectiveMeetingMin / effectiveActiveMin) * 100) : 0;

  const moodLabel =
    effectiveMeetingPct > 50
      ? "Meeting-heavy"
      : effectiveWorkPct > 70
        ? "Focused"
        : "Collaborative";
  const moodColor =
    effectiveMeetingPct > 50
      ? "bg-yellow-500/15 text-yellow-400"
      : effectiveWorkPct > 70
        ? "bg-emerald/15 text-emerald"
        : "bg-indigo/15 text-indigo-light";

  // Aggregate activity breakdown from period-filtered dailyActivities (respects time filter)
  const categoryMinutes = new Map<string, number>();
  for (const day of api.dailyActivities) {
    for (const c of (day.categoryBreakdown || []) as { category: string; minutes: number }[]) {
      categoryMinutes.set(c.category, (categoryMinutes.get(c.category) || 0) + c.minutes);
    }
  }

  // Fall back to session-level classifications when dailyActivities have no meaningful category data
  const totalCategoryMinutes = [...categoryMinutes.values()].reduce((s, v) => s + v, 0);
  if (totalCategoryMinutes === 0 && api.sessionActivities && api.sessionActivities.length > 0) {
    categoryMinutes.clear();
    for (const session of api.sessionActivities) {
      for (const act of session.activities || []) {
        const cat = act.category || "Other";
        categoryMinutes.set(cat, (categoryMinutes.get(cat) || 0) + (act.minutes || 0));
      }
    }
  }

  const activities = [...categoryMinutes.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cat, mins]) => ({
      id: cat.toLowerCase(),
      label: cat.charAt(0).toUpperCase() + cat.slice(1),
      hours: Math.round((mins / 60) * 10) / 10,
      color: CATEGORY_COLORS[cat.toLowerCase()] || CATEGORY_COLORS.other,
    }));

  if (activities.length === 0) {
    activities.push(
      { id: "work", label: "Work", hours: workHours, color: "#6366F1" },
      { id: "meetings", label: "Meetings", hours: meetingHours, color: "#F59E0B" }
    );
  }

  // Build trend — fall back to session durations when dailyActivities time fields are 0
  const dailyTotalsAreZero = api.dailyActivities.every(
    (d) => d.totalWorkMinutes === 0 && d.totalMeetingMinutes === 0
  );
  let trend: PersonViewModel["weeklyTrend"];

  if (dailyTotalsAreZero && api.sessionActivities?.length > 0) {
    // Group session minutes by date
    const sessionMinByDate = new Map<string, number>();
    for (const sess of api.sessionActivities) {
      const dateKey = new Date(sess.startedAt).toISOString().split("T")[0]!;
      sessionMinByDate.set(
        dateKey,
        (sessionMinByDate.get(dateKey) || 0) + (sess.durationMinutes || 0)
      );
    }
    // Merge with dailyActivities dates (to keep the date range correct)
    const allDates = new Set([
      ...api.dailyActivities.map((d) => d.date),
      ...sessionMinByDate.keys(),
    ]);
    trend = [...allDates].sort().map((date) => ({
      day: date,
      focus: Math.round(((sessionMinByDate.get(date) || 0) / 60) * 10) / 10,
      meetings: 0,
      other: 0,
    }));
  } else {
    trend = api.dailyActivities
      .map((d) => ({
        day: d.date,
        focus: Math.round((d.totalWorkMinutes / 60) * 10) / 10,
        meetings: Math.round((d.totalMeetingMinutes / 60) * 10) / 10,
        other: 0,
      }))
      .reverse();
  }

  // Build recent work items from session summaries + user docs
  const recentWork: RecentWorkItem[] = [];

  // Add session summaries
  if (api.sessionActivities && api.sessionActivities.length > 0) {
    for (const session of api.sessionActivities) {
      const sessionDate = new Date(session.startedAt);
      const dateStr = sessionDate.toLocaleDateString([], { month: "short", day: "numeric" });
      const timeStr = sessionDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      const fullContent = session.summary || session.sessionName || "Work session";
      // Strip markdown for the plain-text preview (first ~150 chars)
      const plainText = fullContent
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/[*_~`]/g, "")
        .replace(/^[-•]\s+/gm, "")
        .replace(/\n+/g, " ")
        .trim();
      const preview = plainText.length > 150 ? plainText.slice(0, 150) + "…" : plainText;

      // Determine primary category from classified activities
      const catCounts = new Map<string, number>();
      for (const act of session.activities || []) {
        if (act.category) catCounts.set(act.category, (catCounts.get(act.category) || 0) + 1);
      }
      const topCat = [...catCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

      recentWork.push({
        id: session.sessionId,
        type: "session",
        title: session.sessionName || "Work Session",
        preview,
        fullContent,
        date: dateStr,
        time: timeStr,
        durationMinutes: session.durationMinutes,
        category: topCat,
      });
    }
  }

  // Add user-created documents
  if (api.documents && api.documents.length > 0) {
    for (const doc of api.documents) {
      const docDate = new Date(doc.createdAt);
      const dateStr = docDate.toLocaleDateString([], { month: "short", day: "numeric" });
      const timeStr = docDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      const plainText = (doc.content || "")
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/[*_~`]/g, "")
        .replace(/^[-•]\s+/gm, "")
        .replace(/\n+/g, " ")
        .trim();
      const preview = plainText.length > 150 ? plainText.slice(0, 150) + "…" : plainText;

      recentWork.push({
        id: doc.id,
        type: "doc",
        title: doc.title,
        preview,
        fullContent: doc.content,
        date: dateStr,
        time: timeStr,
        docType: doc.docType,
      });
    }
  }

  // Sort all by date descending (most recent first)
  recentWork.sort((a, b) => {
    const da = new Date(`${a.date} ${a.time}`).getTime();
    const db = new Date(`${b.date} ${b.time}`).getTime();
    return db - da;
  });

  // Aggregate top topics from period-filtered dailyActivities (respects time filter)
  const topicCounts = new Map<string, number>();
  for (const day of api.dailyActivities) {
    for (const c of (day.categoryBreakdown || []) as { category: string; minutes: number }[]) {
      const label = c.category.charAt(0).toUpperCase() + c.category.slice(1);
      topicCounts.set(label, (topicCounts.get(label) || 0) + Math.round(c.minutes / 30));
    }
  }

  // Fall back to session-level classifications when dailyActivities have no meaningful topic data
  const totalTopicCounts = [...topicCounts.values()].reduce((s, v) => s + v, 0);
  if (totalTopicCounts === 0 && api.sessionActivities && api.sessionActivities.length > 0) {
    topicCounts.clear();
    for (const session of api.sessionActivities) {
      for (const act of session.activities || []) {
        const label = act.category || "Other";
        topicCounts.set(label, (topicCounts.get(label) || 0) + 1);
      }
    }
  }

  const topTopics: PersonViewModel["topTopics"] = [...topicCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label, count]) => ({ label, count }));

  return {
    name: u.name,
    role: u.role || "Employee",
    email: u.email,
    startDate: "—",
    lastActive: s.daysTracked > 0 ? "Today" : "—",
    mood: moodLabel,
    moodColor,
    metrics: [
      {
        label: "Avg Focus Time",
        value: `${workHours}h`,
        sub: isSingleDay ? periodLabel : `per day ${periodLabel}`,
      },
      {
        label: "Active Time",
        value: `${activeHours}h`,
        sub: isSingleDay ? periodLabel : `avg/day ${periodLabel}`,
      },
      {
        label: "Meeting Time",
        value: `${meetingHours}h`,
        sub: isSingleDay ? periodLabel : `avg/day ${periodLabel}`,
      },
      { label: "Days Tracked", value: `${s.daysTracked}`, sub: periodLabel },
    ],
    activities,
    weeklyTrend: trend.length > 0 ? trend : [{ day: "—", focus: 0, meetings: 0, other: 0 }],
    recentWork,
    topTopics: topTopics.length > 0 ? topTopics : [{ label: "No data", count: 0 }],
  };
}

const timeRangeToPeriod: Record<TimeRange, DashboardPeriod> = {
  yesterday: "yesterday",
  week: "week",
  month: "month",
  ytd: "ytd",
  all: "all",
};

function ChartTooltipCustom({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-canvas-overlay border border-stroke-subtle rounded-lg px-3 py-2 text-xs shadow-lg space-y-1">
      <p className="text-text-primary font-medium">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-text-secondary">
            {entry.name}: {entry.value}h
          </span>
        </div>
      ))}
    </div>
  );
}

const timeRangeLabels: Record<TimeRange, string> = {
  yesterday: "Yesterday",
  week: "This Week",
  month: "This Month",
  ytd: "Year to Date",
  all: "All Time",
};

export default function PersonDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [drillDownMetric, setDrillDownMetric] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedWork, setSelectedWork] = useState<RecentWorkItem | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [workFilter, setWorkFilter] = useState<"all" | "session" | "doc">("all");
  const [workSearchQuery, setWorkSearchQuery] = useState("");
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);

  const { data: apiDetail } = useDashboardPersonDetail(id || "", timeRangeToPeriod[timeRange]);
  const { data: drillDownData } = useUserDrillDown(
    id || "",
    drillDownMetric,
    timeRangeToPeriod[timeRange]
  );
  const { data: categoryData } = useCategoryActivities(
    id || "",
    selectedCategory,
    timeRangeToPeriod[timeRange]
  );
  const { data: docData, isLoading: docLoading } = useDocument(selectedDocId || "");

  const handleDrillDown = (label: string) => {
    const metricKey = LABEL_TO_METRIC[label] || label.toLowerCase();
    // If it's a known metric card, use org-style drill-down; otherwise it's a category
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
  };

  const person = useMemo(() => {
    if (apiDetail) {
      return transformApiToPersonViewModel(apiDetail, timeRange);
    }
    return null;
  }, [apiDetail, timeRange]);

  if (!person) {
    return (
      <div className="h-screen overflow-y-auto p-8 pb-16 space-y-6">
        <button
          onClick={() => navigate("/people")}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft size={16} />
          <span className="text-sm">Back to People</span>
        </button>
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-3" />
            <p className="text-sm text-text-secondary">Loading activity data...</p>
          </div>
        </div>
      </div>
    );
  }

  const totalActivityHours = person.activities.reduce((s, a) => s + a.hours, 0);

  // Inline read-only doc viewer
  if (selectedDocId) {
    const DOC_TYPE_LABELS: Record<string, string> = {
      "how-to": "How-To Guide",
      "knowledge-article": "Knowledge Article",
      troubleshooting: "Troubleshooting Guide",
    };
    const DOC_STATUS_COLORS: Record<string, string> = {
      draft: "bg-yellow-500/20 text-yellow-400",
      published: "bg-green-500/20 text-green-400",
      archived: "bg-gray-500/20 text-gray-400",
    };

    return (
      <div className="h-screen flex flex-col">
        {/* Doc header */}
        <div className="flex items-start justify-between p-6 border-b border-border-subtle">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSelectedDocId(null)}
              className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-canvas-overlay transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText size={20} className="text-primary" />
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
                        {DOC_TYPE_LABELS[docData?.docType || ""] || docData?.docType}
                      </span>
                      {docData?.status && (
                        <Badge className={DOC_STATUS_COLORS[docData.status] || ""}>
                          {docData.status}
                        </Badge>
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

        {/* Metadata bar */}
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
            {docData.creator && (
              <div className="text-text-secondary">
                By:{" "}
                <span className="text-text-primary">
                  {docData.creator.firstName} {docData.creator.lastName}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Read-only editor */}
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

  // Full-page session summary view — AI Edit mode (reuses AIEditPanel)
  if (selectedWork && selectedWork.type === "session" && isEditingSummary) {
    return (
      <AIEditPanel
        title="Edit Summary"
        subtitle={selectedWork.title}
        initialContent={selectedWork.fullContent}
        onSave={async (content: string) => {
          await updateSessionSummary(selectedWork.id, content);
          setSelectedWork({ ...selectedWork, fullContent: content });
          setIsEditingSummary(false);
        }}
        onAutoSave={async (content: string) => {
          await updateSessionSummary(selectedWork.id, content);
        }}
        onCancel={() => setIsEditingSummary(false)}
        onRevise={async (instruction: string, currentContent: string) => {
          return reviseSummary(selectedWork.id, instruction, currentContent);
        }}
        placeholder="Edit the session summary..."
        contextLabel="session summary"
        sessionId={selectedWork.id}
      />
    );
  }

  // Full-page session summary view — read mode (like doc viewer)
  if (selectedWork && selectedWork.type === "session") {
    const handleCopySummary = async () => {
      await navigator.clipboard.writeText(selectedWork.fullContent);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2000);
    };

    return (
      <div className="h-screen flex flex-col">
        {/* Session header */}
        <div className="flex items-start justify-between p-6 border-b border-border-subtle">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setSelectedWork(null);
                setIsEditingSummary(false);
              }}
              className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-canvas-overlay transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald/10 flex items-center justify-center">
                <Zap size={20} className="text-emerald" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-text-primary">{selectedWork.title}</h2>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-text-secondary text-sm">
                    {selectedWork.date}, {selectedWork.time}
                  </span>
                  {selectedWork.durationMinutes != null && selectedWork.durationMinutes > 0 && (
                    <span className="text-text-secondary text-sm">
                      · {truncateDuration(selectedWork.durationMinutes)}
                    </span>
                  )}
                  {selectedWork.category && (
                    <Badge className="bg-canvas-overlay text-text-secondary text-[10px]">
                      {selectedWork.category}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Summary content */}
        <div className="flex-1 overflow-auto bg-background-primary">
          <div className="max-w-3xl mx-auto px-8 py-6">
            {/* Summary heading + actions */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-text-primary">Summary</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopySummary}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-canvas-overlay border border-stroke-subtle transition-colors"
                >
                  {copiedSummary ? (
                    <>
                      <Check size={14} className="text-emerald" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Clipboard size={14} />
                      Copy
                    </>
                  )}
                </button>
                <button
                  onClick={() => setIsEditingSummary(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-canvas-overlay border border-stroke-subtle transition-colors"
                >
                  <Edit size={14} />
                  Edit
                </button>
              </div>
            </div>

            {/* Summary body — rich text rendering */}
            <div className="rounded-xl border border-stroke-subtle bg-canvas-overlay/50 p-5">
              <DocEditor
                key={selectedWork.id}
                initialContent={selectedWork.fullContent}
                readOnly
                showToolbar={false}
                placeholder=""
                className="h-full"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen overflow-hidden">
      <div className="h-full overflow-y-auto p-8 pb-16 space-y-6">
        {/* Back button */}
        <button
          onClick={() => navigate("/people")}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft size={16} />
          <span className="text-sm">Back to People</span>
        </button>

        {/* User header + time filter */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-indigo/20 flex items-center justify-center text-lg font-semibold text-indigo-light">
              {person.name
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </div>
            <div>
              <h1 className="text-3xl font-bold text-text-primary">{person.name}</h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-sm text-text-secondary">{person.role}</span>
                <span className="text-text-tertiary">·</span>
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${person.moodColor}`}
                >
                  {person.mood}
                </span>
                <span className="text-text-tertiary">·</span>
                <span className="flex items-center gap-1 text-xs text-text-secondary">
                  <Zap size={10} className="text-emerald" />
                  {person.lastActive}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-text-tertiary">
                <span className="flex items-center gap-1">
                  <Calendar size={10} />
                  Started {person.startDate}
                </span>
                <span>{person.email}</span>
              </div>
            </div>
          </div>

          {/* Time filter */}
          <div className="flex items-center rounded-lg bg-canvas-overlay border border-stroke-subtle p-0.5 self-center">
            {(Object.keys(timeRangeLabels) as TimeRange[]).map((key) => (
              <button
                key={key}
                onClick={() => setTimeRange(key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-normal ${
                  timeRange === key
                    ? "bg-indigo text-white shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {key === "ytd"
                  ? "YTD"
                  : key === "all"
                    ? "All"
                    : timeRangeLabels[key].replace("This ", "")}
              </button>
            ))}
          </div>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-4 gap-4">
          {person.metrics.map((m) => (
            <div
              key={m.label}
              onClick={() => handleDrillDown(m.label)}
              className="relative overflow-hidden rounded-xl border border-stroke-subtle bg-canvas-raised p-4 cursor-pointer hover:border-indigo/40 transition-colors"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none rounded-xl" />
              <div className="relative">
                <p className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">
                  {m.label}
                </p>
                <p className="text-2xl font-bold text-text-primary mt-1">{m.value}</p>
                <p className="text-xs text-text-secondary mt-0.5">{m.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Activity breakdown + Weekly trend */}
        <div className="grid grid-cols-2 gap-4">
          {/* Activity breakdown */}
          <div className="relative overflow-hidden rounded-xl border border-stroke-subtle bg-canvas-raised p-5">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none rounded-xl" />
            <h3 className="relative text-sm font-semibold text-text-primary mb-4">
              Activity Breakdown
              <span className="text-text-secondary font-normal ml-2">
                {timeRangeLabels[timeRange]}
              </span>
            </h3>
            <div className="relative flex h-3 rounded-full overflow-hidden mb-4">
              {person.activities.map((a) => (
                <div
                  key={a.id}
                  style={{
                    width: `${totalActivityHours > 0 ? (a.hours / totalActivityHours) * 100 : 0}%`,
                    backgroundColor: a.color,
                  }}
                />
              ))}
            </div>
            <div className="relative space-y-2">
              {person.activities.map((a) => (
                <div
                  key={a.id}
                  onClick={() => handleDrillDown(a.label)}
                  className="flex items-center justify-between cursor-pointer rounded-lg px-2 py-1.5 -mx-2 hover:bg-canvas-overlay transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: a.color }}
                    />
                    <span className="text-xs text-text-primary">{a.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-secondary">{a.hours}h</span>
                    <span className="text-[10px] text-text-tertiary w-7 text-right">
                      {totalActivityHours > 0
                        ? Math.round((a.hours / totalActivityHours) * 100)
                        : 0}
                      %
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Weekly trend */}
          <div className="relative overflow-hidden rounded-xl border border-stroke-subtle bg-canvas-raised p-5">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none rounded-xl" />
            <h3 className="relative text-sm font-semibold text-text-primary mb-4">
              Weekly Trend
              <span className="text-text-secondary font-normal ml-2">Hours per day</span>
            </h3>
            <div className="relative h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={person.weeklyTrend} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: "#A1A1A1", fontSize: 11 }}
                    axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#A1A1A1", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <Tooltip
                    content={<ChartTooltipCustom />}
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  />
                  <Bar
                    dataKey="focus"
                    name="Focus"
                    fill="#6366F1"
                    radius={[3, 3, 0, 0]}
                    stackId="a"
                  />
                  <Bar
                    dataKey="meetings"
                    name="Meetings"
                    fill="#F59E0B"
                    radius={[0, 0, 0, 0]}
                    stackId="a"
                  />
                  <Bar
                    dataKey="other"
                    name="Other"
                    fill="#818CF8"
                    radius={[3, 3, 0, 0]}
                    stackId="a"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Recent work + Top topics */}
        <div className="grid grid-cols-3 gap-4">
          {/* Recent work — session summaries + docs */}
          <div className="col-span-2 relative overflow-hidden rounded-xl border border-stroke-subtle bg-canvas-raised p-5">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none rounded-xl" />
            <div className="relative space-y-3 mb-4">
              <h3 className="text-sm font-semibold text-text-primary">
                Recent Work
                <span className="text-text-secondary font-normal ml-2">
                  What they've been doing
                </span>
              </h3>
              <div className="flex items-center justify-between gap-3">
                <div className="relative flex-1 max-w-xs">
                  <Search
                    size={14}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
                  />
                  <input
                    type="text"
                    value={workSearchQuery}
                    onChange={(e) => setWorkSearchQuery(e.target.value)}
                    placeholder="Filter by topic or customer..."
                    className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-canvas-overlay border border-stroke-subtle text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-indigo/50 transition-colors"
                  />
                  {workSearchQuery && (
                    <button
                      onClick={() => setWorkSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1 bg-canvas-overlay rounded-lg p-0.5 shrink-0">
                  {(["all", "session", "doc"] as const).map((f) => {
                    const label = f === "all" ? "All" : f === "session" ? "Blocks" : "Docs";
                    const count =
                      f === "all"
                        ? person.recentWork.length
                        : person.recentWork.filter((w) => w.type === f).length;
                    return (
                      <button
                        key={f}
                        onClick={() => setWorkFilter(f)}
                        className={`text-[11px] px-2.5 py-1 rounded-md transition-colors ${
                          workFilter === f
                            ? "bg-canvas-raised text-text-primary font-medium shadow-sm"
                            : "text-text-tertiary hover:text-text-secondary"
                        }`}
                      >
                        {label}
                        {count > 0 ? ` (${count})` : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            {(() => {
              const query = workSearchQuery.toLowerCase().trim();
              const filtered = person.recentWork.filter((w) => {
                const matchesType = workFilter === "all" || w.type === workFilter;
                const matchesSearch =
                  !query ||
                  w.title.toLowerCase().includes(query) ||
                  w.preview.toLowerCase().includes(query) ||
                  (w.category && w.category.toLowerCase().includes(query));
                return matchesType && matchesSearch;
              });
              return (
                <div className="relative space-y-1 max-h-[440px] overflow-y-auto pr-1">
                  {filtered.length === 0 ? (
                    <p className="text-sm text-text-tertiary py-4 text-center">
                      {query
                        ? `No results for "${workSearchQuery}"`
                        : workFilter === "all"
                          ? "No activity yet"
                          : `No ${workFilter === "doc" ? "documents" : "blocks"} yet`}
                    </p>
                  ) : (
                    filtered.map((item) => (
                      <button
                        key={item.id}
                        onClick={() =>
                          item.type === "doc" ? setSelectedDocId(item.id) : setSelectedWork(item)
                        }
                        className="w-full text-left flex items-start gap-3 py-3 px-2 -mx-2 rounded-lg border border-transparent hover:border-stroke-subtle hover:bg-canvas-overlay/50 transition-colors cursor-pointer"
                      >
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            item.type === "doc"
                              ? "text-indigo-light bg-indigo/15"
                              : "text-emerald bg-emerald/15"
                          }`}
                        >
                          {item.type === "doc" ? <FileText size={14} /> : <Zap size={14} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-text-primary truncate">
                            {item.title}
                          </p>
                          <p className="text-xs text-text-secondary mt-0.5 line-clamp-2 leading-relaxed">
                            {item.preview}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-text-tertiary">
                              {item.date}, {item.time}
                            </span>
                            {item.category && (
                              <span className="text-[9px] font-medium text-text-tertiary bg-canvas-overlay px-1.5 py-0.5 rounded">
                                {item.category}
                              </span>
                            )}
                            {item.docType && (
                              <span className="text-[9px] font-medium text-indigo-light bg-indigo/10 px-1.5 py-0.5 rounded">
                                {item.docType}
                              </span>
                            )}
                            {item.durationMinutes != null && item.durationMinutes > 0 && (
                              <span className="text-[9px] text-text-tertiary">
                                {truncateDuration(item.durationMinutes)}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              );
            })()}
          </div>

          {/* Top topics */}
          <div className="relative overflow-hidden rounded-xl border border-stroke-subtle bg-canvas-raised p-5">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none rounded-xl" />
            <h3 className="relative text-sm font-semibold text-text-primary mb-4">
              Top Topics
              <span className="text-text-secondary font-normal ml-2">Most worked on</span>
            </h3>
            <div className="relative space-y-3">
              {person.topTopics.map((topic) => {
                const maxCount = person.topTopics[0].count;
                return (
                  <div key={topic.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-text-primary">{topic.label}</span>
                      <span className="text-[10px] text-text-tertiary">{topic.count} blocks</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-canvas-overlay overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo transition-all duration-normal"
                        style={{ width: `${maxCount > 0 ? (topic.count / maxCount) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Metric drill-down overlay (org-style — for metric cards) */}
      {drillDownMetric && drillDownData && (
        <div className="absolute top-0 right-0 h-full w-[420px] p-4 z-20">
          <DrillDownPanel data={drillDownData} onClose={closeDrillDown} />
        </div>
      )}

      {/* Category activity list panel (per-user — for activity breakdown) */}
      {selectedCategory && (
        <div className="absolute top-0 right-0 h-full w-[420px] p-4 z-20">
          <div className="flex flex-col h-full rounded-xl border border-stroke-subtle bg-canvas-raised overflow-hidden">
            {/* Header */}
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
                  ? `${categoryData.totalHours}h across ${categoryData.activityCount} activities · ${timeRangeLabels[timeRange]}`
                  : "Loading..."}
              </p>
            </div>

            {/* Activity list */}
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
                  const dateStr = date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });
                  const timeStr = date.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  });
                  const hours = Math.floor(act.durationMinutes / 60);
                  const mins = act.durationMinutes % 60;
                  const duration =
                    hours > 0 ? `${hours}h ${mins > 0 ? `${mins}m` : ""}` : `${mins}m`;

                  return (
                    <div
                      key={act.id}
                      className="rounded-lg border border-stroke-subtle bg-canvas-overlay/50 p-3 hover:border-indigo/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                              act.blockType === "meeting"
                                ? "text-yellow-400 bg-yellow-500/15"
                                : "text-indigo-light bg-indigo/15"
                            }`}
                          >
                            {act.blockType === "meeting" ? (
                              <Calendar size={14} />
                            ) : (
                              <Briefcase size={14} />
                            )}
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
                          {dateStr}, {timeStr}
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
