import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useSubscriberDrillDown } from "@/console/src/hooks/queries/admin";
import type { DashboardPeriod } from "@/console/src/services/adminService";

type TimeRange = "yesterday" | "week" | "month" | "ytd" | "all";

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

const PROJECT_COLORS = [
  "#6366F1",
  "#F472B6",
  "#F59E0B",
  "#818CF8",
  "#34D399",
  "#60A5FA",
  "#A78BFA",
  "#FB923C",
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function CustomerDetailView() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const decodedName = decodeURIComponent(name || "");
  const [timeRange, setTimeRange] = useState<TimeRange>("week");

  const period = timeRangeToPeriod[timeRange];
  const { data, isLoading } = useSubscriberDrillDown(decodedName || null, period);

  // Build project color map from breakdown order
  const projectColorMap = new Map<string, string>();
  data?.breakdown.forEach((item, i) => {
    projectColorMap.set(item.label, PROJECT_COLORS[i % PROJECT_COLORS.length]!);
  });

  // Format trend dates for chart
  const chartData = (data?.trend || []).map((point) => {
    const d = new Date(point.label + "T00:00:00");
    const dayLabel = d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    return { name: dayLabel, hours: point.value };
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-text-secondary">No data found for "{decodedName}"</p>
        <button
          onClick={() => navigate("/dashboard")}
          className="text-sm text-indigo hover:underline"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors mb-3"
          >
            <ArrowLeft size={14} />
            Back to Dashboard
          </button>
          <h1 className="text-3xl font-bold text-text-primary">{data.title}</h1>
          <p className="text-sm text-text-secondary mt-1">{data.subtitle}</p>
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

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        {data.stats.map((stat) => (
          <div
            key={stat.label}
            className="relative overflow-hidden rounded-xl border border-stroke-subtle bg-canvas-raised p-4"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none rounded-xl" />
            <div className="relative">
              <p className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">
                {stat.label}
              </p>
              <p className="text-2xl font-bold text-text-primary mt-1">{stat.value}</p>
              <p className="text-xs text-text-secondary mt-0.5">
                {stat.label === "Total"
                  ? "across team"
                  : stat.label === "% Team"
                    ? "of all time"
                    : stat.label === "People"
                      ? "contributors"
                      : "active"}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* 2-col: Trend + Projects */}
      <div className="grid grid-cols-2 gap-4">
        {/* Daily Trend */}
        <div className="relative overflow-hidden rounded-xl border border-stroke-subtle bg-canvas-raised p-5">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none rounded-xl" />
          <h3 className="relative text-sm font-semibold text-text-primary mb-1">Daily Trend</h3>
          <p className="relative text-xs text-text-secondary mb-4">Hours per day</p>
          {chartData.length > 0 ? (
            <div className="relative h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "#888" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#888" }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#1a1a2e",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    formatter={(value: number) => [`${value}h`, "Hours"]}
                  />
                  <Bar dataKey="hours" fill="#6366F1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="relative flex items-center justify-center h-[200px] text-xs text-text-tertiary">
              No trend data
            </div>
          )}
        </div>

        {/* Projects Breakdown */}
        <div className="relative overflow-hidden rounded-xl border border-stroke-subtle bg-canvas-raised p-5">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none rounded-xl" />
          <h3 className="relative text-sm font-semibold text-text-primary mb-4">Projects</h3>
          <div className="relative space-y-3">
            {data.breakdown.map((item, i) => (
              <div key={item.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-text-primary">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-text-primary">{item.value}</span>
                    {item.bar !== undefined && (
                      <span className="text-xs text-text-tertiary">{item.bar}%</span>
                    )}
                  </div>
                </div>
                {item.bar !== undefined && (
                  <div className="h-2 rounded-full bg-canvas-overlay overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-normal"
                      style={{
                        width: `${item.bar}%`,
                        backgroundColor: PROJECT_COLORS[i % PROJECT_COLORS.length],
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
            {data.breakdown.length === 0 && (
              <p className="text-xs text-text-tertiary text-center py-8">No project data</p>
            )}
          </div>
        </div>
      </div>

      {/* Team Members */}
      {data.teamBreakdown && data.teamBreakdown.length > 0 && (
        <div className="relative overflow-hidden rounded-xl border border-stroke-subtle bg-canvas-raised">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none rounded-xl" />
          <div className="relative px-5 py-4 border-b border-stroke-subtle flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">Team Members</h3>
            <span className="text-xs text-text-secondary">
              {data.teamBreakdown.length} {data.teamBreakdown.length === 1 ? "person" : "people"}
            </span>
          </div>
          <div className="relative divide-y divide-stroke-subtle">
            {data.teamBreakdown.map((member) => (
              <div
                key={member.userId}
                onClick={() => navigate(`/people/${member.userId}`)}
                className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-canvas-overlay/50 transition-colors"
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-indigo/20 flex items-center justify-center shrink-0">
                  {member.avatarUrl ? (
                    <img
                      src={member.avatarUrl}
                      alt={member.name}
                      className="w-9 h-9 rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-xs font-semibold text-indigo">
                      {getInitials(member.name || member.email || "?")}
                    </span>
                  )}
                </div>

                {/* Name + title */}
                <div className="min-w-[140px]">
                  <p className="text-sm font-medium text-text-primary">
                    {member.name || member.email}
                  </p>
                  {member.jobTitle && (
                    <p className="text-xs text-text-secondary">{member.jobTitle}</p>
                  )}
                </div>

                {/* Total hours */}
                <div className="min-w-[60px] text-right">
                  <p className="text-sm font-semibold text-text-primary">{member.totalHours}h</p>
                </div>

                {/* Project breakdown */}
                <div className="flex-1 flex flex-wrap gap-x-4 gap-y-1 ml-4">
                  {member.projects.slice(0, 4).map((proj) => (
                    <div key={proj.topicName} className="flex items-center gap-1.5">
                      <div
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: projectColorMap.get(proj.topicName) || "#A1A1A1",
                        }}
                      />
                      <span className="text-xs text-text-secondary">{proj.topicName}</span>
                      <span className="text-xs text-text-tertiary">{proj.hours}h</span>
                    </div>
                  ))}
                  {member.projects.length > 4 && (
                    <span className="text-xs text-text-tertiary">
                      +{member.projects.length - 4} more
                    </span>
                  )}
                </div>

                {/* Chevron */}
                <ChevronRight size={16} className="text-text-tertiary shrink-0" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
