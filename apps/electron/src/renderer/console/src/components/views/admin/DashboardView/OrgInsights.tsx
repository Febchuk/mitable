import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { WeeklyTrendPoint } from "./mockData";

interface OrgInsightsProps {
  weeklyTrend: WeeklyTrendPoint[];
  periodLabel: string;
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

export default function OrgInsights({ weeklyTrend, periodLabel }: OrgInsightsProps) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-stroke-subtle bg-canvas-raised p-5">
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none rounded-xl" />
      <h3 className="relative text-sm font-semibold text-text-primary mb-4">
        Activity Trend
        <span className="text-text-secondary font-normal ml-2">{periodLabel}</span>
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
  );
}
