interface TopicEntry {
  id: string;
  label: string;
  hours: number;
  color: string;
}

interface TopicBreakdownProps {
  topics: TopicEntry[];
  periodLabel: string;
}

const TOPIC_COLORS = [
  "#6366F1",
  "#F472B6",
  "#F59E0B",
  "#818CF8",
  "#34D399",
  "#60A5FA",
  "#A78BFA",
  "#FB923C",
  "#2DD4BF",
  "#E879F9",
];

export function getTopicColor(index: number): string {
  return TOPIC_COLORS[index % TOPIC_COLORS.length]!;
}

export default function TopicBreakdown({ topics, periodLabel }: TopicBreakdownProps) {
  const totalHours = topics.reduce((sum, t) => sum + t.hours, 0);

  if (topics.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-stroke-subtle bg-canvas-raised p-5">
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none rounded-xl" />
        <h3 className="relative text-sm font-semibold text-text-primary mb-4">
          Topic Breakdown
          <span className="text-text-secondary font-normal ml-2">{periodLabel}</span>
        </h3>
        <p className="relative text-sm text-text-tertiary">No topic data yet.</p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-stroke-subtle bg-canvas-raised p-5">
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none rounded-xl" />
      <h3 className="relative text-sm font-semibold text-text-primary mb-4">
        Topic Breakdown
        <span className="text-text-secondary font-normal ml-2">{periodLabel}</span>
      </h3>

      {/* Stacked bar */}
      <div className="relative flex h-3 rounded-full overflow-hidden mb-5">
        {topics.map((topic) => (
          <div
            key={topic.id}
            style={{
              width: `${totalHours > 0 ? (topic.hours / totalHours) * 100 : 0}%`,
              backgroundColor: topic.color,
            }}
          />
        ))}
      </div>

      {/* Legend list — scrollable when many topics */}
      <div className="relative space-y-2 max-h-[320px] overflow-y-auto overflow-x-hidden pr-1">
        {topics.map((topic) => {
          const pct = totalHours > 0 ? Math.round((topic.hours / totalHours) * 100) : 0;
          return (
            <div
              key={topic.id}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 -mx-2"
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: topic.color }}
                />
                <span className="text-sm text-text-primary">{topic.label}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-text-secondary">{topic.hours}h</span>
                <span className="text-xs text-text-tertiary w-8 text-right">{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
