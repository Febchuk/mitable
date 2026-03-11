import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

interface SubscriberEntry {
  label: string;
  value: number;
  hours: number;
  color: string;
}

interface SubscriberBreakdownProps {
  subscribers: SubscriberEntry[];
  periodLabel: string;
  onDrillDown?: (label: string) => void;
}

const SUBSCRIBER_COLORS = [
  "#6366F1",
  "#F472B6",
  "#F59E0B",
  "#818CF8",
  "#34D399",
  "#60A5FA",
  "#A78BFA",
  "#FB923C",
  "#A1A1A1",
];

export function getSubscriberColor(index: number): string {
  return SUBSCRIBER_COLORS[index % SUBSCRIBER_COLORS.length]!;
}

function SubscriberTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const { label, value, hours } = payload[0].payload;
  return (
    <div className="bg-canvas-overlay border border-stroke-subtle rounded-lg px-3 py-2 text-xs shadow-lg">
      <span className="text-text-primary font-medium">{label}</span>
      <span className="text-text-secondary ml-2">
        {hours}h ({value}%)
      </span>
    </div>
  );
}

export default function SubscriberBreakdown({
  subscribers,
  periodLabel,
  onDrillDown,
}: SubscriberBreakdownProps) {
  const isClickable = (label: string) =>
    onDrillDown && label !== "Internal / Unattributed";

  if (subscribers.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-stroke-subtle bg-canvas-raised p-5">
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none rounded-xl" />
        <h3 className="relative text-sm font-semibold text-text-primary mb-4">
          Customer / Client Time
          <span className="text-text-secondary font-normal ml-2">{periodLabel}</span>
        </h3>
        <p className="text-sm text-text-tertiary">No customer data yet.</p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-stroke-subtle bg-canvas-raised p-5">
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none rounded-xl" />
      <h3 className="relative text-sm font-semibold text-text-primary mb-4">
        Customer / Client Time
        <span className="text-text-secondary font-normal ml-2">{periodLabel}</span>
      </h3>
      <div className="relative flex items-center gap-6">
        <div className="w-[180px] h-[180px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={subscribers}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                dataKey="value"
                strokeWidth={0}
                style={{ cursor: onDrillDown ? "pointer" : undefined }}
                onClick={(_, index) => {
                  const entry = subscribers[index];
                  if (entry && isClickable(entry.label)) onDrillDown!(entry.label);
                }}
              >
                {subscribers.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<SubscriberTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-2">
          {subscribers.map((entry) => (
            <div
              key={entry.label}
              className={`flex items-center justify-between ${
                isClickable(entry.label)
                  ? "cursor-pointer rounded-lg px-2 py-1.5 -mx-2 hover:bg-canvas-overlay transition-colors"
                  : "px-2 py-1.5 -mx-2"
              }`}
              onClick={() => isClickable(entry.label) && onDrillDown!(entry.label)}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-xs text-text-primary">{entry.label}</span>
              </div>
              <span className="text-xs text-text-secondary">
                {entry.hours}h ({entry.value}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
