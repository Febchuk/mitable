import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, FileText, MessageSquare, Clock, Video, Zap, Calendar } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useDashboardPersonDetail } from "@/console/src/hooks/queries/admin";
import type { DashboardPeriod, DashboardPersonDetail as PersonDetailData } from "@/console/src/services/adminService";

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
  highlights: { time: string; text: string; type: "doc" | "meeting" | "support" | "code"; category?: string; minutes?: number }[];
  topTopics: { label: string; count: number }[];
}

type TimeRange = "day" | "week" | "month" | "ytd";

function categoryToType(category?: string): "doc" | "meeting" | "support" | "code" {
  if (!category) return "doc";
  const lower = category.toLowerCase();
  if (lower === "meeting") return "meeting";
  if (lower === "development" || lower === "design") return "code";
  if (lower === "communication" || lower === "project management") return "support";
  return "doc";
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
  const workHours = Math.round((s.totalWorkMinutes / 60) * 10) / 10;
  const meetingHours = Math.round((s.totalMeetingMinutes / 60) * 10) / 10;
  const activeHours = Math.round((s.totalActiveMinutes / 60) * 10) / 10;

  const periodLabel = { day: "today", week: "this week", month: "this month", ytd: "year to date" }[range];
  const moodLabel = s.meetingPercentage > 50 ? "Meeting-heavy" : s.workPercentage > 70 ? "Focused" : "Collaborative";
  const moodColor = s.meetingPercentage > 50
    ? "bg-yellow-500/15 text-yellow-400"
    : s.workPercentage > 70
      ? "bg-emerald/15 text-emerald"
      : "bg-indigo/15 text-indigo-light";

  // Aggregate activity breakdown from session-level classifications
  const categoryMinutes = new Map<string, number>();
  if (api.sessionActivities && api.sessionActivities.length > 0) {
    for (const session of api.sessionActivities) {
      for (const act of session.activities || []) {
        const cat = act.category || "Other";
        categoryMinutes.set(cat, (categoryMinutes.get(cat) || 0) + (act.minutes || 0));
      }
    }
  }

  // Fall back to dailyActivities category breakdown if no session data
  if (categoryMinutes.size === 0) {
    for (const day of api.dailyActivities) {
      for (const c of (day.categoryBreakdown || []) as { category: string; minutes: number }[]) {
        categoryMinutes.set(c.category, (categoryMinutes.get(c.category) || 0) + c.minutes);
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

  const trend: PersonViewModel["weeklyTrend"] = api.dailyActivities.map((d) => ({
    day: d.date,
    focus: Math.round((d.totalWorkMinutes / 60) * 10) / 10,
    meetings: Math.round((d.totalMeetingMinutes / 60) * 10) / 10,
    other: 0,
  })).reverse();

  // Build highlights from session-level classified activities (complete timeline)
  const highlights: PersonViewModel["highlights"] = [];

  if (api.sessionActivities && api.sessionActivities.length > 0) {
    for (const session of api.sessionActivities) {
      const sessionDate = new Date(session.startedAt);
      const timeStr =
        sessionDate.toLocaleDateString([], { month: "short", day: "numeric" }) +
        ", " +
        sessionDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

      if (session.activities && session.activities.length > 0) {
        for (const act of session.activities) {
          highlights.push({
            time: timeStr,
            text: act.description || act.activity,
            type: categoryToType(act.category),
            category: act.category,
            minutes: act.minutes,
          });
        }
      } else {
        // Session without classification — show session name/summary
        highlights.push({
          time: timeStr,
          text: session.summary || session.sessionName || "Work session",
          type: "doc",
        });
      }
    }
  } else {
    // Fallback to activity_blocks for backward compat
    for (const b of [...api.blocks].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())) {
      highlights.push({
        time:
          new Date(b.startTime).toLocaleDateString([], { month: "short", day: "numeric" }) +
          ", " +
          new Date(b.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        text: b.description || b.name,
        type: b.type === "meeting" ? "meeting" as const : "doc" as const,
      });
    }
  }

  // Aggregate top topics from session activity names
  const topicCounts = new Map<string, number>();
  if (api.sessionActivities && api.sessionActivities.length > 0) {
    for (const session of api.sessionActivities) {
      for (const act of session.activities || []) {
        const label = act.category || "Other";
        topicCounts.set(label, (topicCounts.get(label) || 0) + 1);
      }
    }
  }

  // Fall back to dailyActivities
  if (topicCounts.size === 0) {
    for (const day of api.dailyActivities) {
      for (const c of (day.categoryBreakdown || []) as { category: string; minutes: number }[]) {
        const label = c.category.charAt(0).toUpperCase() + c.category.slice(1);
        topicCounts.set(label, (topicCounts.get(label) || 0) + Math.round(c.minutes / 30));
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
      { label: "Avg Focus Time", value: `${workHours}h`, sub: `per day ${periodLabel}` },
      { label: "Active Time", value: `${activeHours}h`, sub: periodLabel },
      { label: "Meeting Time", value: `${meetingHours}h`, sub: periodLabel },
      { label: "Days Tracked", value: `${s.daysTracked}`, sub: periodLabel },
    ],
    activities,
    weeklyTrend: trend.length > 0 ? trend : [{ day: "—", focus: 0, meetings: 0, other: 0 }],
    highlights: highlights.length > 0 ? highlights : [{ time: "—", text: "No activity blocks yet", type: "doc" }],
    topTopics: topTopics.length > 0 ? topTopics : [{ label: "No data", count: 0 }],
  };
}

const timeRangeToPeriod: Record<TimeRange, DashboardPeriod> = {
  day: "today",
  week: "week",
  month: "month",
  ytd: "ytd",
};

const highlightIcons: Record<string, typeof FileText> = {
  doc: FileText,
  meeting: Video,
  support: MessageSquare,
  code: Zap,
};

const highlightColors: Record<string, string> = {
  doc: "text-indigo-light bg-indigo/15",
  meeting: "text-yellow-400 bg-yellow-500/15",
  support: "text-rose bg-rose/15",
  code: "text-emerald bg-emerald/15",
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
  day: "Today",
  week: "This Week",
  month: "This Month",
  ytd: "Year to Date",
};

export default function PersonDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [timeRange, setTimeRange] = useState<TimeRange>("month");

  const { data: apiDetail } = useDashboardPersonDetail(id || "", timeRangeToPeriod[timeRange]);

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

  return (
    <div className="h-screen overflow-y-auto p-8 pb-16 space-y-6">
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
              {key === "ytd" ? "YTD" : timeRangeLabels[key].replace("This ", "")}
            </button>
          ))}
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-4 gap-4">
        {person.metrics.map((m) => (
          <div
            key={m.label}
            className="relative overflow-hidden rounded-xl border border-stroke-subtle bg-canvas-raised p-4"
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
            <span className="text-text-secondary font-normal ml-2">{timeRangeLabels[timeRange]}</span>
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
              <div key={a.id} className="flex items-center justify-between">
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
                    {totalActivityHours > 0 ? Math.round((a.hours / totalActivityHours) * 100) : 0}%
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

      {/* Recent highlights + Top topics */}
      <div className="grid grid-cols-3 gap-4">
        {/* Recent work highlights */}
        <div className="col-span-2 relative overflow-hidden rounded-xl border border-stroke-subtle bg-canvas-raised p-5">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none rounded-xl" />
          <h3 className="relative text-sm font-semibold text-text-primary mb-4">
            Recent Work
            <span className="text-text-secondary font-normal ml-2">What they've been doing</span>
          </h3>
          <div className="relative space-y-1 max-h-[440px] overflow-y-auto pr-1">
            {person.highlights.map((h, i) => {
              const Icon = highlightIcons[h.type] || Clock;
              const colorClass = highlightColors[h.type] || "text-text-secondary bg-canvas-overlay";
              return (
                <div
                  key={i}
                  className="flex items-start gap-3 py-2.5 border-b border-stroke-subtle last:border-0"
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}
                  >
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary">{h.text}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[10px] text-text-tertiary">{h.time}</p>
                      {h.category && (
                        <span className="text-[9px] font-medium text-text-tertiary bg-canvas-overlay px-1.5 py-0.5 rounded">
                          {h.category}
                        </span>
                      )}
                      {h.minutes != null && h.minutes > 0 && (
                        <span className="text-[9px] text-text-tertiary">
                          {h.minutes < 60 ? `${h.minutes}m` : `${Math.round(h.minutes / 6) / 10}h`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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
  );
}
