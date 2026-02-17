import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import MetricCards from "./MetricCards";
import ActivityBreakdown from "./ActivityBreakdown";
import OrgInsights from "./OrgInsights";
import ChatPanel from "./ChatPanel";
import DrillDownPanel from "./DrillDownPanel";
import { getDrillDown } from "./drillDownData";
import type { DrillDownItem } from "./drillDownData";
import type { TimeRange, MetricData, ActivityEntry, WorkBlock, WeeklyTrendPoint } from "./mockData";
import { useDashboardMetrics } from "@/console/src/hooks/queries/admin";
import type { DashboardPeriod, DashboardMetrics } from "@/console/src/services/adminService";

const timeRangeLabels: Record<TimeRange, string> = {
  day: "Today",
  week: "This Week",
  month: "This Month",
  ytd: "Year to Date",
};

const timeRangeToPeriod: Record<TimeRange, DashboardPeriod> = {
  day: "today",
  week: "week",
  month: "month",
  ytd: "ytd",
};

const CATEGORY_COLORS: Record<string, string> = {
  development: "#6366F1",
  communication: "#F472B6",
  research: "#F59E0B",
  design: "#818CF8",
  review: "#34D399",
  documentation: "#60A5FA",
  standup: "#F59E0B",
  planning: "#F59E0B",
  team_sync: "#818CF8",
  one_on_one: "#F472B6",
  external: "#34D399",
  other: "#A1A1A1",
};

function transformApiData(api: DashboardMetrics): {
  metrics: MetricData[];
  activityBreakdown: ActivityEntry[];
  workBlocks: WorkBlock[];
  trend: WeeklyTrendPoint[];
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

  const activityBreakdown: ActivityEntry[] = (api.activityDistribution || []).map(
    (d) => ({
      id: d.category,
      label: d.category.charAt(0).toUpperCase() + d.category.slice(1),
      hours: Math.round((d.totalMinutes / 60) * 10) / 10,
      color: CATEGORY_COLORS[d.category] || CATEGORY_COLORS.other,
    })
  );

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

  return { metrics, activityBreakdown, workBlocks, trend };
}

export default function DashboardView() {
  const [chatOpen, setChatOpen] = useState(false);
  const [drillDown, setDrillDown] = useState<DrillDownItem | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("month");

  const { data: apiData } = useDashboardMetrics(timeRangeToPeriod[timeRange]);

  const data = useMemo(() => {
    if (apiData?.hasData) {
      return transformApiData(apiData);
    }
    // No data — return empty structure instead of mock data
    return {
      metrics: [
        { label: "Avg Focus Time", value: "0h", change: "No data yet", changeType: "neutral" as const, description: "Average deep work per person" },
        { label: "Avg Active Time", value: "0h", change: "No data yet", changeType: "neutral" as const, description: "Average total tracked time per person" },
        { label: "Avg Meeting Load", value: "0h", change: "No data yet", changeType: "neutral" as const, description: "Average meeting time per person" },
        { label: "People Tracked", value: "0", change: "No data yet", changeType: "neutral" as const, description: "Users with activity data" },
      ],
      activityBreakdown: [],
      workBlocks: [],
      trend: [],
    };
  }, [apiData, timeRange]);

  const handleDrillDown = (label: string) => {
    const detail = getDrillDown(label);
    if (detail) {
      setChatOpen(false);
      setDrillDown(detail);
    }
  };

  const closeDrillDown = () => setDrillDown(null);

  return (
    <div className="relative h-full overflow-hidden">
      {/* Dashboard content — full width, no scroll */}
      <div className="h-full overflow-hidden p-6 flex flex-col gap-4">
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
                {key === "ytd" ? "YTD" : timeRangeLabels[key].replace("This ", "")}
              </button>
            ))}
          </div>
        </div>

        {/* Metric cards */}
        <div className="shrink-0">
          <MetricCards metrics={data.metrics} onDrillDown={handleDrillDown} />
        </div>

        {/* Charts row: Activity breakdown + Work block distribution */}
        <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
          <ActivityBreakdown activities={data.activityBreakdown} onDrillDown={handleDrillDown} />
          <OrgInsights workBlocks={data.workBlocks} weeklyTrend={data.trend} />
        </div>
      </div>

      {/* Drill-down overlay panel */}
      {drillDown && (
        <div className="absolute top-0 right-0 h-full w-[420px] p-4 z-20">
          <DrillDownPanel data={drillDown} onClose={closeDrillDown} />
        </div>
      )}

      {/* Chat overlay panel — slides in from the right */}
      {chatOpen && !drillDown && (
        <>
          <div className="absolute inset-0 z-10" onClick={() => setChatOpen(false)} />
          <div className="absolute top-4 right-4 bottom-16 w-[380px] z-20">
            <ChatPanel period={timeRangeToPeriod[timeRange]} onClose={() => setChatOpen(false)} />
          </div>
        </>
      )}

      {/* Minimized chat button — fixed to viewport bottom-right */}
      {!chatOpen && !drillDown && (
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
