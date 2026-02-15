import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import MetricCards from "./MetricCards";
import ActivityBreakdown from "./ActivityBreakdown";
import OrgInsights from "./OrgInsights";
import ChatPanel from "./ChatPanel";
import DrillDownPanel from "./DrillDownPanel";
import { getDrillDown } from "./drillDownData";
import type { DrillDownItem } from "./drillDownData";
import { getDataByTimeRange, sampleMessages } from "./mockData";
import type { TimeRange } from "./mockData";

const timeRangeLabels: Record<TimeRange, string> = {
  day: "Today",
  week: "This Week",
  month: "This Month",
  ytd: "Year to Date",
};

export default function DashboardView() {
  const [chatOpen, setChatOpen] = useState(false);
  const [drillDown, setDrillDown] = useState<DrillDownItem | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("week");

  const data = useMemo(() => getDataByTimeRange(timeRange), [timeRange]);

  const handleDrillDown = (label: string) => {
    const detail = getDrillDown(label);
    if (detail) {
      setChatOpen(false);
      setDrillDown(detail);
    }
  };

  const closeDrillDown = () => setDrillDown(null);

  return (
    <div className="relative h-screen overflow-hidden">
      {/* Dashboard content — full width */}
      <div className="h-full overflow-y-auto p-8 pb-20 space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between">
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
        <MetricCards metrics={data.metrics} onDrillDown={handleDrillDown} />

        {/* Charts row: Activity breakdown + Work block distribution */}
        <div className="grid grid-cols-2 gap-4">
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
        <div className="absolute top-0 right-0 h-full w-[400px] p-4 z-20">
          <ChatPanel messages={sampleMessages} onClose={() => setChatOpen(false)} />
        </div>
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
