import type { ActivityEntry } from "./mockData";

interface ActivityBreakdownProps {
  activities: ActivityEntry[];
  periodLabel: string;
  onDrillDown: (label: string) => void;
}

export default function ActivityBreakdown({
  activities,
  periodLabel,
  onDrillDown,
}: ActivityBreakdownProps) {
  const totalHours = activities.reduce((sum, a) => sum + a.hours, 0);

  return (
    <div className="relative overflow-hidden rounded-xl border border-stroke-subtle bg-canvas-raised p-5">
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none rounded-xl" />
      <h3 className="relative text-sm font-semibold text-text-primary mb-4">
        Activity Breakdown
        <span className="text-text-secondary font-normal ml-2">{periodLabel}</span>
      </h3>

      {/* Stacked bar */}
      <div className="relative flex h-3 rounded-full overflow-hidden mb-5">
        {activities.map((activity) => (
          <div
            key={activity.id}
            className="transition-all duration-normal"
            style={{
              width: `${(activity.hours / totalHours) * 100}%`,
              backgroundColor: activity.color,
            }}
          />
        ))}
      </div>

      {/* Legend list */}
      <div className="relative space-y-3">
        {activities.map((activity) => {
          const pct = Math.round((activity.hours / totalHours) * 100);
          return (
            <div
              key={activity.label}
              className="flex items-center justify-between cursor-pointer rounded-lg px-2 py-1.5 -mx-2 hover:bg-canvas-overlay transition-colors duration-normal"
              onClick={() => onDrillDown(activity.label)}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: activity.color }}
                />
                <span className="text-sm text-text-primary">{activity.label}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-text-secondary">{activity.hours}h</span>
                <span className="text-xs text-text-tertiary w-8 text-right">{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
