import { useMemo, useState } from "react";
import { Clock, Monitor, Video } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, type TooltipProps } from "recharts";
import {
  useLocalActivity,
  type MeActivityPeriod,
  type ActivityBlock,
  type MeActivityData,
} from "@/console/src/hooks/queries/local-activity";

// ── Constants ────────────────────────────────────────────────

const PERIODS: { key: MeActivityPeriod; label: string }[] = [
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "quarter", label: "Quarter" },
];

const CLIENT_COLORS = [
  "var(--mi-accent)",
  "rgba(var(--mi-accent-rgb), 0.7)",
  "rgba(var(--mi-accent-rgb), 0.5)",
  "rgba(var(--mi-accent-rgb), 0.35)",
  "rgba(var(--mi-accent-rgb), 0.2)",
];

// ── Helpers ──────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatBigDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatBlockTime(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatBlockDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

// ── Sub-components ───────────────────────────────────────────

function ClientTooltip({ active, payload }: TooltipProps<number, string>) {
  const entry = payload?.[0]?.payload as { name: string; value: number; hours: string } | undefined;
  if (!active || !entry) return null;
  return (
    <div className="bg-canvas-overlay border border-stroke-subtle rounded-lg px-3 py-2 text-xs shadow-lg">
      <span className="text-text-primary font-medium">{entry.name}</span>
      <span className="text-text-secondary ml-2">
        {entry.hours} ({entry.value}%)
      </span>
    </div>
  );
}

function BlockIcon({ type }: { type: string }) {
  const Icon = type === "meeting" ? Video : Monitor;
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        border: "var(--border-subtle)",
        background: "rgba(var(--ui-rgb), 0.04)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-secondary)",
        flexShrink: 0,
      }}
    >
      <Icon size={18} />
    </div>
  );
}

// ── Derived view model ───────────────────────────────────────

function buildViewModel(data: MeActivityData) {
  const totalMin = Math.round(data.totalActiveMs / 60000);

  // Category breakdown
  const catEntries = Object.entries(data.categoryBreakdown)
    .map(([cat, ms]) => ({ id: cat, label: capitalize(cat), minutes: Math.round(ms / 60000), ms }))
    .sort((a, b) => b.ms - a.ms);
  const totalCatMs = catEntries.reduce((s, e) => s + e.ms, 0);

  // Client breakdown from IPC
  const clientEntries = Object.entries(data.clientBreakdown ?? {});
  const totalClientMs = clientEntries.reduce((s, [, ms]) => s + ms, 0);
  const clients = clientEntries
    .sort((a, b) => b[1] - a[1])
    .map(([name, ms], i) => ({
      name,
      value: totalClientMs > 0 ? Math.round((ms / totalClientMs) * 100) : 0,
      hours: formatDuration(ms),
      color: CLIENT_COLORS[i % CLIENT_COLORS.length]!,
    }));

  return { totalMin, catEntries, totalCatMs, clients };
}

// ── Main Component ───────────────────────────────────────────

export default function MeView() {
  const [period, setPeriod] = useState<MeActivityPeriod>("week");
  const { data, isLoading } = useLocalActivity(period) as {
    data: MeActivityData | undefined;
    isLoading: boolean;
  };

  const vm = useMemo(() => (data ? buildViewModel(data) : null), [data]);

  // Loading state
  if (isLoading) {
    return (
      <div style={{ height: "100vh", padding: "32px 36px" }}>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 26,
            color: "var(--text-primary)",
            fontWeight: 400,
            letterSpacing: "-0.3px",
            margin: 0,
          }}
        >
          My Activity
        </h1>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            paddingTop: 120,
          }}
        >
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  // Empty state
  if (!vm || (vm.totalMin === 0 && (!data?.recentBlocks || data.recentBlocks.length === 0))) {
    return (
      <div style={{ height: "100vh", overflowY: "auto", padding: "32px 36px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 20,
            marginBottom: 32,
          }}
        >
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 26,
              color: "var(--text-primary)",
              fontWeight: 400,
              letterSpacing: "-0.3px",
              margin: 0,
            }}
          >
            My Activity
          </h1>
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>
        <div style={{ textAlign: "center", padding: "120px 0" }}>
          <p style={{ fontSize: 15, color: "var(--text-secondary)", margin: 0 }}>
            No activity data yet
          </p>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "8px 0 0" }}>
            Your activity metrics will appear here as you work.
          </p>
        </div>
      </div>
    );
  }

  const showClients = vm.clients.length > 0;

  return (
    <div
      style={{
        height: "100vh",
        overflowY: "auto",
        padding: "32px 36px",
        display: "flex",
        flexDirection: "column",
        gap: 32,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 20,
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 26,
            color: "var(--text-primary)",
            fontWeight: 400,
            letterSpacing: "-0.3px",
            margin: 0,
          }}
        >
          My Activity
        </h1>
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>

      {/* Big number */}
      <div style={{ padding: "0 2px" }}>
        <span
          style={{
            fontSize: 10,
            color: "var(--text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.09em",
            fontFamily: "var(--font-sans)",
          }}
        >
          Total Active Time
        </span>
        <div
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 48,
            color: "var(--text-primary)",
            fontWeight: 300,
            letterSpacing: -2,
            lineHeight: 1,
            marginTop: 6,
          }}
        >
          {formatBigDuration(data!.totalActiveMs)}
        </div>
      </div>

      {/* Customer Work + Category Breakdown */}
      <div
        style={{ display: "grid", gridTemplateColumns: showClients ? "1fr 1fr" : "1fr", gap: 16 }}
      >
        {showClients && (
          <Card title="Customer Work">
            <div style={{ display: "flex", alignItems: "center", gap: 24, minHeight: 180 }}>
              <div style={{ width: 156, height: 156, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={vm.clients}
                      cx="50%"
                      cy="50%"
                      innerRadius={44}
                      outerRadius={70}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {vm.clients.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ClientTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                {vm.clients.map((entry) => (
                  <div
                    key={entry.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <div
                        style={{
                          width: 16,
                          height: 3,
                          borderRadius: 999,
                          background: entry.color,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 13,
                          color: "var(--text-primary)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {entry.name}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)", flexShrink: 0 }}>
                      {entry.hours} ({entry.value}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Category Breakdown */}
        <Card title="Activity Breakdown">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {vm.catEntries.map((cat) => {
              const pct = vm.totalCatMs > 0 ? Math.round((cat.ms / vm.totalCatMs) * 100) : 0;
              return (
                <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span
                    style={{
                      flex: "0 1 120px",
                      minWidth: 0,
                      fontSize: 13,
                      color: "var(--text-secondary)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {cat.label}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          height: 3,
                          borderRadius: 999,
                          background: "rgba(var(--ui-rgb), 0.06)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${pct}%`,
                            height: "100%",
                            borderRadius: 999,
                            background: "var(--mi-accent)",
                          }}
                        />
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--text-tertiary)",
                        flexShrink: 0,
                        minWidth: 40,
                        textAlign: "right",
                      }}
                    >
                      {formatDuration(cat.ms)}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--text-tertiary)",
                        flexShrink: 0,
                        minWidth: 34,
                        textAlign: "right",
                      }}
                    >
                      {pct}%
                    </span>
                  </div>
                </div>
              );
            })}
            {vm.catEntries.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0 }}>
                No category data
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* Daily Trend */}
      {data!.dailySummaries.length > 0 && (
        <Card title="Daily Trend">
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 6,
              height: 120,
              padding: "0 4px",
            }}
          >
            {data!.dailySummaries.map((day) => {
              const maxMs = Math.max(...data!.dailySummaries.map((d) => d.totalActiveMs), 1);
              const heightPct = Math.max(4, (day.totalActiveMs / maxMs) * 100);
              return (
                <div
                  key={day.date}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      maxWidth: 32,
                      height: `${heightPct}%`,
                      background: "var(--mi-accent)",
                      borderRadius: 4,
                      minHeight: 4,
                      transition: "height 0.3s ease",
                    }}
                    title={`${formatBlockDate(day.date)}: ${formatDuration(day.totalActiveMs)}`}
                  />
                  <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                    {formatBlockDate(day.date)}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Recent Blocks */}
      <Card title="Recent Work">
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {!data?.recentBlocks || data.recentBlocks.length === 0 ? (
            <p
              style={{
                fontSize: 13,
                color: "var(--text-tertiary)",
                margin: 0,
                textAlign: "center",
                padding: "16px 0",
              }}
            >
              No recent work blocks
            </p>
          ) : (
            data.recentBlocks.map((block) => <BlockRow key={block.id} block={block} />)
          )}
        </div>
      </Card>
    </div>
  );
}

// ── Shared UI pieces ─────────────────────────────────────────

function PeriodPicker({
  value,
  onChange,
}: {
  value: MeActivityPeriod;
  onChange: (p: MeActivityPeriod) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 1,
        background: "rgba(var(--ui-rgb), 0.05)",
        borderRadius: 7,
        padding: 3,
        flexShrink: 0,
      }}
    >
      {PERIODS.map((p) => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          style={{
            padding: "4px 12px",
            borderRadius: 5,
            fontSize: 11,
            fontFamily: "var(--font-sans)",
            color: value === p.key ? "var(--text-primary)" : "var(--text-secondary)",
            background: value === p.key ? "var(--bg-overlay)" : "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--bg-raised)",
        border: "var(--border-hairline)",
        borderRadius: 12,
        padding: "22px 24px",
      }}
    >
      <span
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.09em",
          color: "var(--text-secondary)",
          fontFamily: "var(--font-sans)",
          display: "block",
          marginBottom: 18,
        }}
      >
        {title}
      </span>
      {children}
    </div>
  );
}

function truncateNarrative(text: string | undefined, maxSentences = 2): string {
  if (!text) return "";
  const sentences = text.match(/[^.!?]+[.!?]+/g);
  if (!sentences || sentences.length <= maxSentences) return text;
  return sentences.slice(0, maxSentences).join("").trim();
}

function BlockRow({ block }: { block: ActivityBlock }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
        padding: "14px 0",
        borderTop: "var(--border-hairline)",
      }}
    >
      <BlockIcon type="work" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5, margin: 0 }}>
          {truncateNarrative(block.narrative)}
        </p>
        <div
          style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 6 }}
        >
          <span
            style={{
              fontSize: 11,
              color: "var(--text-tertiary)",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Clock size={11} />
            {formatBlockDate(block.date)}, {formatBlockTime(block.startMs)}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            {formatDuration(block.durationMs)}
          </span>
          {block.topCategory && (
            <span
              style={{
                fontSize: 10,
                color: "var(--text-tertiary)",
                background: "rgba(var(--ui-rgb), 0.04)",
                borderRadius: 4,
                padding: "2px 6px",
              }}
            >
              {capitalize(block.topCategory)}
            </span>
          )}
          {block.topApp && (
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{block.topApp}</span>
          )}
        </div>
      </div>
    </div>
  );
}
