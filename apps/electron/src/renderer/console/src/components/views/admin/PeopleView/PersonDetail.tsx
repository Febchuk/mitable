import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, FileText, MessageSquare, Clock, Video, Zap, Calendar } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// ── Mock data for the prototype ───────────────────────────────

interface MockUser {
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
  highlights: { time: string; text: string; type: "doc" | "meeting" | "support" | "code" }[];
  topTopics: { label: string; count: number }[];
}

type TimeRange = "day" | "week" | "month" | "ytd";

function getMockUser(id: string, range: TimeRange): MockUser {
  const names = [
    "Billy TheKid",
    "Mike Jones",
    "Maya Johnson",
    "Ethan Miller",
    "Olivia Davis",
    "Daniel Brown",
    "Sophie Anderson",
    "James Wilson",
  ];
  const roles = [
    "Forward Deployed Engineer",
    "Forward Deployed Engineer",
    "Product Designer",
    "Backend Engineer",
    "Customer Success",
    "Data Analyst",
    "Frontend Engineer",
    "Sales Lead",
  ];
  const moods = [
    { label: "Focused", color: "bg-emerald/15 text-emerald" },
    { label: "Collaborative", color: "bg-indigo/15 text-indigo-light" },
    { label: "Meeting-heavy", color: "bg-yellow-500/15 text-yellow-400" },
  ];

  const idx = Math.abs(id.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % names.length;
  const moodIdx = idx % moods.length;

  const multiplier = { day: 1, week: 5, month: 20, ytd: 120 }[range];
  const periodLabel = { day: "today", week: "this week", month: "this month", ytd: "year to date" }[
    range
  ];
  const focusBase = 3.5 + ((idx * 0.3) % 2);

  const trendData: Record<TimeRange, MockUser["weeklyTrend"]> = {
    day: [
      { day: "9am", focus: 0.8 + (idx % 1), meetings: 0.5, other: 0.3 },
      { day: "10am", focus: 1.2, meetings: 0.2, other: 0.4 },
      { day: "11am", focus: 0.5, meetings: 1.0 + (idx % 0.5), other: 0.2 },
      { day: "12pm", focus: 0.3, meetings: 0, other: 0.8 },
      { day: "1pm", focus: 0.9, meetings: 0.5, other: 0.3 },
      { day: "2pm", focus: 1.1 + (idx % 0.8), meetings: 0.2, other: 0.4 },
      { day: "3pm", focus: 0.8, meetings: 0.3, other: 0.2 },
    ],
    week: [
      { day: "Mon", focus: 3.2 + (idx % 2), meetings: 1.5, other: 2.1 },
      { day: "Tue", focus: 4.1 + (idx % 1.5), meetings: 1.0, other: 1.8 },
      { day: "Wed", focus: 2.8, meetings: 2.5 + (idx % 1), other: 1.5 },
      { day: "Thu", focus: 3.9 + (idx % 1.2), meetings: 1.2, other: 2.0 },
      { day: "Fri", focus: 3.0, meetings: 0.8, other: 1.2 },
    ],
    month: [
      { day: "Wk 1", focus: 18 + (idx % 4), meetings: 6.5, other: 8 },
      { day: "Wk 2", focus: 20 + (idx % 3), meetings: 5.8, other: 7.5 },
      { day: "Wk 3", focus: 17, meetings: 8.2 + (idx % 2), other: 6.8 },
      { day: "Wk 4", focus: 19 + (idx % 2), meetings: 6.0, other: 7.2 },
    ],
    ytd: [
      { day: "Jan", focus: 78 + (idx % 10), meetings: 28, other: 34 },
      { day: "Feb", focus: 72, meetings: 32 + (idx % 5), other: 30 },
      { day: "Mar", focus: 85 + (idx % 8), meetings: 26, other: 36 },
      { day: "Apr", focus: 80, meetings: 30, other: 32 + (idx % 4) },
      { day: "May", focus: 88 + (idx % 6), meetings: 24, other: 35 },
      { day: "Jun", focus: 82, meetings: 28 + (idx % 3), other: 33 },
    ],
  };

  const highlightsData: Record<TimeRange, MockUser["highlights"]> = {
    day: [
      { time: "2:30 PM", text: "Completed API documentation for payment module", type: "doc" },
      { time: "11:00 AM", text: "Sprint planning — discussed Q1 priorities", type: "meeting" },
      { time: "9:15 AM", text: "Resolved 3 customer tickets (billing issues)", type: "support" },
    ],
    week: [
      {
        time: "Today, 2:30 PM",
        text: "Completed API documentation for payment module",
        type: "doc",
      },
      {
        time: "Today, 11:00 AM",
        text: "Sprint planning — discussed Q1 priorities",
        type: "meeting",
      },
      {
        time: "Today, 9:15 AM",
        text: "Resolved 3 customer tickets (billing issues)",
        type: "support",
      },
      {
        time: "Yesterday, 4:00 PM",
        text: "Reviewed PR #482 — caching layer refactor",
        type: "code",
      },
      {
        time: "Yesterday, 1:30 PM",
        text: "Wrote incident post-mortem for outage #12",
        type: "doc",
      },
      {
        time: "Tue, 10:00 AM",
        text: "1:1 with manager — career growth discussion",
        type: "meeting",
      },
    ],
    month: [
      { time: "This week", text: "Completed API docs v2 and payment module spec", type: "doc" },
      { time: "This week", text: "Resolved 12 support tickets across 3 clients", type: "support" },
      {
        time: "Last week",
        text: "Led sprint retro — identified 4 process improvements",
        type: "meeting",
      },
      { time: "Last week", text: "Reviewed 8 PRs including auth refactor", type: "code" },
      { time: "2 weeks ago", text: "Wrote onboarding guide for new engineers", type: "doc" },
      { time: "3 weeks ago", text: "Presented Q4 metrics to leadership", type: "meeting" },
    ],
    ytd: [
      {
        time: "This month",
        text: "Completed API docs v2, payment module, and auth specs",
        type: "doc",
      },
      { time: "This month", text: "Resolved 38 support tickets — best month yet", type: "support" },
      { time: "Last month", text: "Led 2 sprint retros and quarterly planning", type: "meeting" },
      { time: "Last month", text: "Reviewed 22 PRs including 3 major refactors", type: "code" },
      { time: "Q1", text: "Published 8 internal docs and 2 runbooks", type: "doc" },
      { time: "Q1", text: "Onboarded 2 new team members", type: "meeting" },
    ],
  };

  const topicMultiplier = { day: 1, week: 1, month: 4, ytd: 24 }[range];

  return {
    name: names[idx],
    role: roles[idx],
    email: `${names[idx].toLowerCase().replace(" ", ".")}@company.com`,
    startDate: "Sep 2024",
    lastActive: "5 min ago",
    mood: moods[moodIdx].label,
    moodColor: moods[moodIdx].color,
    metrics: [
      { label: "Avg Focus Time", value: `${focusBase.toFixed(1)}h`, sub: `per day ${periodLabel}` },
      {
        label: "Docs Created",
        value: `${Math.round(((2 + (idx % 5)) * multiplier) / 5)}`,
        sub: periodLabel,
      },
      {
        label: "Meetings Attended",
        value: `${Math.round(((4 + (idx % 6)) * multiplier) / 5)}`,
        sub: periodLabel,
      },
      {
        label: "Questions Asked",
        value: `${Math.round(((1 + (idx % 4)) * multiplier) / 5)}`,
        sub: `to Mitable AI ${periodLabel}`,
      },
    ],
    activities: [
      {
        id: "technical-writing",
        label: "Technical Writing",
        hours: +(((8.5 + (idx % 4)) * multiplier) / 5).toFixed(1),
        color: "#6366F1",
      },
      {
        id: "customer-support",
        label: "Customer Support",
        hours: +(((5.2 + (idx % 3)) * multiplier) / 5).toFixed(1),
        color: "#F472B6",
      },
      {
        id: "sprint-planning",
        label: "Sprint Planning",
        hours: +(((3.8 + (idx % 2)) * multiplier) / 5).toFixed(1),
        color: "#F59E0B",
      },
      {
        id: "code-review",
        label: "Code Review",
        hours: +(((2.5 + (idx % 3)) * multiplier) / 5).toFixed(1),
        color: "#818CF8",
      },
      {
        id: "bug-triage",
        label: "Bug Triage",
        hours: +(((1.8 + (idx % 2)) * multiplier) / 5).toFixed(1),
        color: "#34D399",
      },
    ],
    weeklyTrend: trendData[range],
    highlights: highlightsData[range],
    topTopics: [
      { label: "API Documentation", count: 12 * topicMultiplier },
      { label: "Payment Integration", count: 8 * topicMultiplier },
      { label: "Sprint Ceremonies", count: 6 * topicMultiplier },
      { label: "Customer Billing", count: 5 * topicMultiplier },
    ],
  };
}

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
  const [timeRange, setTimeRange] = useState<TimeRange>("week");

  const person = getMockUser(id || "default", timeRange);
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
            <span className="text-text-secondary font-normal ml-2">This Week</span>
          </h3>
          <div className="relative flex h-3 rounded-full overflow-hidden mb-4">
            {person.activities.map((a) => (
              <div
                key={a.id}
                style={{
                  width: `${(a.hours / totalActivityHours) * 100}%`,
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
                    {Math.round((a.hours / totalActivityHours) * 100)}%
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
          <div className="relative space-y-1">
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
                    <p className="text-[10px] text-text-tertiary mt-0.5">{h.time}</p>
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
                      style={{ width: `${(topic.count / maxCount) * 100}%` }}
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
