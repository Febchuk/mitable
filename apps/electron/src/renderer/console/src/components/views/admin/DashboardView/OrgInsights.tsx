import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { WorkBlock, WeeklyTrendPoint } from "./mockData";

interface OrgInsightsProps {
  workBlocks: WorkBlock[];
  weeklyTrend: WeeklyTrendPoint[];
}

function PieChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const { label, value } = payload[0].payload;
  return (
    <div className="bg-canvas-overlay border border-stroke-subtle rounded-lg px-3 py-2 text-xs shadow-lg">
      <span className="text-text-primary font-medium">{label}</span>
      <span className="text-text-secondary ml-2">{value}%</span>
    </div>
  );
}

function BarChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-canvas-overlay border border-stroke-subtle rounded-lg px-3 py-2 text-xs shadow-lg space-y-1">
      <p className="text-text-primary font-medium">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-text-secondary">
            {entry.name}: {entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function OrgInsights({ workBlocks, weeklyTrend }: OrgInsightsProps) {
  return (
    <div className="space-y-4">
      {/* Pie chart: Work block distribution */}
      <div className="relative overflow-hidden rounded-xl border border-stroke-subtle bg-canvas-raised p-5">
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none rounded-xl" />
        <h3 className="relative text-sm font-semibold text-text-primary mb-4">
          Work Block Distribution
          <span className="text-text-secondary font-normal ml-2">This Week</span>
        </h3>
        <div className="relative flex items-center gap-6">
          <div className="w-[180px] h-[180px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={workBlocks}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {workBlocks.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<PieChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-2">
            {workBlocks.map((block) => (
              <div key={block.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: block.color }}
                  />
                  <span className="text-xs text-text-primary">{block.label}</span>
                </div>
                <span className="text-xs text-text-secondary">{block.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bar chart: Weekly trend */}
      <div className="relative overflow-hidden rounded-xl border border-stroke-subtle bg-canvas-raised p-5">
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none rounded-xl" />
        <h3 className="relative text-sm font-semibold text-text-primary mb-4">
          Weekly Trend
          <span className="text-text-secondary font-normal ml-2">Activities per day</span>
        </h3>
        <div className="relative h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyTrend} barGap={2}>
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
                width={35}
              />
              <Tooltip content={<BarChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar dataKey="activities" name="Activities" fill="#6366F1" radius={[3, 3, 0, 0]} />
              <Bar dataKey="meetings" name="Meetings" fill="#F59E0B" radius={[3, 3, 0, 0]} />
              <Bar dataKey="docs" name="Docs" fill="#34D399" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
