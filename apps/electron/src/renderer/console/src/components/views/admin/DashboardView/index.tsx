import { useAdmin } from "../../../../context/AdminContext";
import MetricCard from "./components/MetricCard";

export default function DashboardView() {
  const { savingsMetric, timeToProductivity, nudgeThemes } = useAdmin();

  return (
    <div className="p-8 space-y-6 app-no-drag">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-white">Dashboard</h1>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-6">
        {/* Total Savings */}
        <MetricCard
          label={savingsMetric.label}
          value={savingsMetric.value}
          description={savingsMetric.description}
        />

        {/* Regained Productivity */}
        <MetricCard
          label="Regained Productivity"
          description="Time that experienced employees reclaim by offloading initial onboarding questions to Mitable AI."
        >
          <div className="space-y-4">
            {/* Bar Chart */}
            <div className="flex items-end gap-12 h-32">
              {/* AI-assisted Bar */}
              <div className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full flex flex-col gap-1">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="h-2 bg-primary rounded-sm" />
                  ))}
                </div>
                <span className="text-text-tertiary text-sm">AI-assisted</span>
              </div>

              {/* Manual Bar (empty) */}
              <div className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full flex flex-col gap-1 h-full">
                  <div className="h-full" />
                </div>
                <span className="text-text-tertiary text-sm">Manual</span>
              </div>
            </div>

            {/* Value */}
            <div className="text-white font-bold text-4xl">10 hours</div>
          </div>
        </MetricCard>

        {/* Top Nudge Themes */}
        <MetricCard
          label="Top Nudge Themes"
          description="Most frequent topics where AI nudges AI-guided onboarding."
        >
          <div className="flex flex-wrap gap-2">
            {nudgeThemes.map((theme) => (
              <span
                key={theme.id}
                className="px-3 py-1.5 bg-white text-black text-sm rounded-md font-medium"
              >
                {theme.label}
              </span>
            ))}
          </div>
        </MetricCard>

        {/* Time to Productivity */}
        <MetricCard
          label={timeToProductivity.label}
          value={timeToProductivity.value}
          description={timeToProductivity.description}
        />
      </div>
    </div>
  );
}
