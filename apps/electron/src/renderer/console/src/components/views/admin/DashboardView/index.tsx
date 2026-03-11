import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import MetricCards from "./MetricCards";
import ActivityBreakdown from "./ActivityBreakdown";
import TopicBreakdown, { getTopicColor } from "./TopicBreakdown";
import SubscriberBreakdown, { getSubscriberColor } from "./SubscriberBreakdown";
import OrgInsights from "./OrgInsights";
import ChatPanel from "./ChatPanel";
import DrillDownPanel from "./DrillDownPanel";
import type { TimeRange, MetricData, ActivityEntry, WorkBlock, WeeklyTrendPoint } from "./mockData";
import {
  useDashboardMetrics,
  useDrillDown,
  useOrganizationSettings,
} from "@/console/src/hooks/queries/admin";
import type { DashboardPeriod, DashboardMetrics } from "@/console/src/services/adminService";

// Map UI labels → API metric keys for drill-down
const LABEL_TO_METRIC: Record<string, string> = {
  "Avg Focus Time": "focus_time",
  "Avg Active Time": "active_time",
  "Avg Meeting Load": "meeting_load",
  "People Tracked": "people_tracked",
};

const timeRangeLabels: Record<TimeRange, string> = {
  yesterday: "Yesterday",
  week: "This Week",
  month: "This Month",
  ytd: "Year to Date",
  all: "All Time",
};

const timeRangeToPeriod: Record<TimeRange, DashboardPeriod> = {
  yesterday: "yesterday",
  week: "week",
  month: "month",
  ytd: "ytd",
  all: "all",
};

const CATEGORY_COLORS: Record<string, string> = {
  development: "#6366F1",
  communication: "#F472B6",
  research: "#F59E0B",
  design: "#818CF8",
  review: "#34D399",
  documentation: "#60A5FA",
  meeting: "#F59E0B",
  standup: "#F59E0B",
  planning: "#F59E0B",
  team_sync: "#818CF8",
  one_on_one: "#F472B6",
  external: "#34D399",
  other: "#A1A1A1",
};

interface TopicEntry {
  id: string;
  label: string;
  hours: number;
  color: string;
}

interface SubscriberEntry {
  label: string;
  value: number;
  hours: number;
  color: string;
}

function transformApiData(api: DashboardMetrics): {
  metrics: MetricData[];
  activityBreakdown: ActivityEntry[];
  workBlocks: WorkBlock[];
  trend: WeeklyTrendPoint[];
  topicBreakdown: TopicEntry[];
  subscriberBreakdown: SubscriberEntry[];
} {
  const m = api.metrics;
  const workHours = Math.round((m.avgWorkMinutes / 60) * 10) / 10;
  const meetingHours = Math.round((m.avgMeetingMinutes / 60) * 10) / 10;
  const activeHours = Math.round((m.avgActiveMinutes / 60) * 10) / 10;

  const metrics: MetricData[] = [
    {
      label: "Avg Focus Time",
      value: `${workHours}h`,
      change: `${m.totalUsersTracked} people tracked`,
      changeType: "neutral",
      description: "Average deep work per person",
    },
    {
      label: "Avg Active Time",
      value: `${activeHours}h`,
      change: `${m.avgWorkPercentage}% work / ${m.avgMeetingPercentage}% meetings`,
      changeType: "neutral",
      description: "Average total tracked time per person",
    },
    {
      label: "Avg Meeting Load",
      value: `${meetingHours}h`,
      change: `${m.totalTeamMeetingMinutes} team minutes total`,
      changeType: meetingHours > 3 ? "up" : "neutral",
      description: "Average meeting time per person",
    },
    {
      label: "People Tracked",
      value: `${m.totalUsersTracked}`,
      change: `${Math.round(m.totalTeamWorkMinutes / 60)}h team work total`,
      changeType: "neutral",
      description: "Users with activity data",
    },
  ];

  const activityBreakdown: ActivityEntry[] = (api.activityDistribution || []).map((d) => ({
    id: d.category,
    label: d.category.charAt(0).toUpperCase() + d.category.slice(1),
    hours: Math.round((d.totalMinutes / 60) * 10) / 10,
    color: CATEGORY_COLORS[d.category] || CATEGORY_COLORS.other,
  }));

  const workBlocks: WorkBlock[] = [
    { label: "Work", value: m.avgWorkPercentage, color: "#6366F1" },
    { label: "Meetings", value: m.avgMeetingPercentage, color: "#F59E0B" },
  ];

  const trend: WeeklyTrendPoint[] = (api.dailyTrend || []).map((d) => ({
    day: d.date,
    activities: Math.round(d.avgWorkMinutes),
    meetings: Math.round(d.avgMeetingMinutes),
    docs: 0,
  }));

  const topicBreakdown: TopicEntry[] = (api.topicDistribution || []).map((t, i) => ({
    id: t.topicName.toLowerCase().replace(/\s+/g, "-"),
    label: t.topicName,
    hours: Math.round((t.totalMinutes / 60) * 10) / 10,
    color: getTopicColor(i),
  }));

  const subscriberBreakdown: SubscriberEntry[] = (() => {
    const dist = api.subscriberDistribution || [];
    const totalSubMinutes = dist.reduce((s, d) => s + d.totalMinutes, 0);
    const totalAllMinutes =
      (api.metrics.totalTeamWorkMinutes || 0) + (api.metrics.totalTeamMeetingMinutes || 0);
    const unattributedMinutes = Math.max(0, totalAllMinutes - totalSubMinutes);

    const entries: SubscriberEntry[] = dist.map((s, i) => ({
      label: s.subscriberName,
      value: s.percentage,
      hours: Math.round((s.totalMinutes / 60) * 10) / 10,
      color: getSubscriberColor(i),
    }));

    if (unattributedMinutes > 0 && totalAllMinutes > 0) {
      entries.push({
        label: "Internal / Unattributed",
        value: Math.round((unattributedMinutes / totalAllMinutes) * 100),
        hours: Math.round((unattributedMinutes / 60) * 10) / 10,
        color: "#A1A1A1",
      });
    }

    return entries;
  })();

  return { metrics, activityBreakdown, workBlocks, trend, topicBreakdown, subscriberBreakdown };
}

export default function DashboardView() {
  const navigate = useNavigate();
  const [chatOpen, setChatOpen] = useState(false);
  const [drillDownMetric, setDrillDownMetric] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("yesterday");

  const { data: apiData } = useDashboardMetrics(timeRangeToPeriod[timeRange]);
  const { data: drillDownData } = useDrillDown(drillDownMetric, timeRangeToPeriod[timeRange]);
  const { data: orgSettings } = useOrganizationSettings();
  const showCustomer = orgSettings?.settings?.showCustomerBreakdown !== false;
  const showTopic = orgSettings?.settings?.showTopicBreakdown !== false;

  const data = useMemo(() => {
    if (apiData?.hasData) {
      return transformApiData(apiData);
    }
    return {
      metrics: [
        {
          label: "Avg Focus Time",
          value: "0h",
          change: "No data yet",
          changeType: "neutral" as const,
          description: "Average deep work per person",
        },
        {
          label: "Avg Active Time",
          value: "0h",
          change: "No data yet",
          changeType: "neutral" as const,
          description: "Average total tracked time per person",
        },
        {
          label: "Avg Meeting Load",
          value: "0h",
          change: "No data yet",
          changeType: "neutral" as const,
          description: "Average meeting time per person",
        },
        {
          label: "People Tracked",
          value: "0",
          change: "No data yet",
          changeType: "neutral" as const,
          description: "Users with activity data",
        },
      ],
      activityBreakdown: [],
      workBlocks: [],
      trend: [],
      topicBreakdown: [],
      subscriberBreakdown: [],
    };
  }, [apiData]);

  const handleDrillDown = (label: string) => {
    // Map label to API key: check metric cards first, then treat as category
    const metricKey = LABEL_TO_METRIC[label] || label.toLowerCase();
    setChatOpen(false);
    setDrillDownMetric(metricKey);
  };

  const handleSubscriberDrillDown = (label: string) => {
    if (label === "Internal / Unattributed") return;
    navigate(`/customer/${encodeURIComponent(label)}`);
  };

  const closeDrillDown = () => {
    setDrillDownMetric(null);
  };

  return (
    <div className="relative h-full overflow-hidden">
      {/* Dashboard content — full width, no scroll */}
      <div className="h-full overflow-y-auto p-6 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-end justify-between shrink-0">
          <div>
            <h1 className="text-4xl font-bold text-text-primary">Dashboard</h1>
            <p className="text-sm text-text-secondary mt-1">
              Showing data for {timeRangeLabels[timeRange].toLowerCase()}
            </p>
          </div>
          <div className="flex items-center rounded-lg bg-canvas-overlay border border-stroke-subtle p-0.5">
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
        <div className="shrink-0">
          <MetricCards metrics={data.metrics} onDrillDown={handleDrillDown} />
        </div>

        {/* Charts grid: 2x2 layout */}
        <div className="grid grid-cols-2 gap-4">
          {showTopic && (
            <TopicBreakdown
              topics={data.topicBreakdown}
              periodLabel={timeRangeLabels[timeRange]}
              onDrillDown={handleDrillDown}
            />
          )}
          {showCustomer && (
            <SubscriberBreakdown
              subscribers={data.subscriberBreakdown}
              periodLabel={timeRangeLabels[timeRange]}
              onDrillDown={handleSubscriberDrillDown}
            />
          )}
          <ActivityBreakdown
            activities={data.activityBreakdown}
            periodLabel={timeRangeLabels[timeRange]}
            onDrillDown={handleDrillDown}
          />
          <OrgInsights
            workBlocks={data.workBlocks}
            weeklyTrend={data.trend}
            periodLabel={timeRangeLabels[timeRange]}
          />
        </div>
      </div>

      {/* Drill-down overlay panel */}
      {drillDownMetric && drillDownData && (
        <div className="absolute top-0 right-0 h-full w-[420px] p-4 z-20">
          <DrillDownPanel data={drillDownData} onClose={closeDrillDown} />
        </div>
      )}

      {/* Chat overlay panel — slides in from the right */}
      {chatOpen && !drillDownMetric && (
        <>
          <div className="absolute inset-0 z-10" onClick={() => setChatOpen(false)} />
          <div className="absolute top-4 right-4 bottom-16 w-[380px] z-20">
            <ChatPanel period={timeRangeToPeriod[timeRange]} onClose={() => setChatOpen(false)} />
          </div>
        </>
      )}

      {/* Minimized chat button — fixed to viewport bottom-right */}
      {!chatOpen && !drillDownMetric && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-8 right-8 z-30 flex items-center gap-2 px-4 py-2.5 rounded-full bg-indigo text-white text-sm font-medium shadow-lg hover:bg-indigo/90 transition-colors"
        >
          <Sparkles size={16} />
          AI Assistant
        </button>
      )}
    </div>
  );
}
