import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUpdateBenchmark } from "@/console/src/hooks/queries/benchmarks";
import type { Benchmark, BenchmarkFrequency } from "@/console/src/services/benchmarkService";

interface BenchmarkSettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  benchmark: Benchmark;
}

const FREQUENCY_OPTIONS: { value: BenchmarkFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
];

export function BenchmarkSettingsPanel({
  open,
  onOpenChange,
  benchmark,
}: BenchmarkSettingsPanelProps) {
  const { mutate: updateBenchmark, isPending } = useUpdateBenchmark();

  const [targetValue, setTargetValue] = useState(String(benchmark.targetValue));
  const [frequency, setFrequency] = useState<BenchmarkFrequency>(benchmark.frequency);
  const [isActive, setIsActive] = useState(benchmark.isActive);

  // Sync with benchmark prop when it changes or dialog opens
  useEffect(() => {
    if (open) {
      setTargetValue(String(benchmark.targetValue));
      setFrequency(benchmark.frequency);
      setIsActive(benchmark.isActive);
    }
  }, [open, benchmark]);

  function handleSave() {
    const parsedTarget = parseFloat(targetValue);
    updateBenchmark(
      {
        id: benchmark.id,
        payload: {
          targetValue: isNaN(parsedTarget) ? undefined : parsedTarget,
          frequency,
          isActive,
        },
      },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      }
    );
  }

  function handleCancel() {
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{
          background: "var(--bg-raised)",
          border: "var(--border-hairline)",
          borderRadius: 14,
          padding: 0,
          maxWidth: 420,
          width: "100%",
          overflow: "hidden",
        }}
      >
        <DialogHeader style={{ padding: "24px 24px 0" }}>
          <DialogTitle
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 20,
              fontWeight: 400,
              color: "var(--text-primary)",
              letterSpacing: "-0.2px",
            }}
          >
            Edit Benchmark
          </DialogTitle>
        </DialogHeader>

        <div style={{ padding: "8px 24px 0" }}>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {benchmark.name}
          </p>
        </div>

        {/* Fields */}
        <div
          style={{
            padding: "20px 24px 0",
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          {/* Target Value */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label
              style={{
                fontSize: 10,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.09em",
                fontFamily: "var(--font-sans)",
              }}
            >
              Target Value
              {benchmark.unit ? (
                <span style={{ marginLeft: 4, textTransform: "none", letterSpacing: 0 }}>
                  ({benchmark.unit})
                </span>
              ) : null}
            </label>
            <input
              type="number"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder={String(benchmark.targetValue)}
              style={{
                width: "100%",
                height: 38,
                padding: "0 12px",
                borderRadius: 8,
                border: "var(--border-hairline)",
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Period */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label
              style={{
                fontSize: 10,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.09em",
                fontFamily: "var(--font-sans)",
              }}
            >
              Frequency
            </label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as BenchmarkFrequency)}
              style={{
                width: "100%",
                height: 38,
                padding: "0 12px",
                borderRadius: 8,
                border: "var(--border-hairline)",
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                fontSize: 13,
                outline: "none",
                cursor: "pointer",
                appearance: "none",
                WebkitAppearance: "none",
              }}
            >
              {FREQUENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Active toggle */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                }}
              >
                Active
              </span>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                Inactive benchmarks are hidden from assignees
              </span>
            </div>
            <label
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
              />
              <div
                style={{
                  width: 36,
                  height: 20,
                  borderRadius: 10,
                  background: isActive ? "#82C0CC" : "rgba(255,255,255,0.1)",
                  transition: "background 0.2s",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 2,
                    left: isActive ? 18 : 2,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: isActive ? "#1A1916" : "rgba(255,255,255,0.6)",
                    transition: "left 0.2s",
                  }}
                />
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "20px 24px 24px",
          }}
        >
          <button
            onClick={handleCancel}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 13,
              border: "var(--border-hairline)",
              background: "transparent",
              color: "var(--text-secondary)",
              cursor: "pointer",
              transition: "background 0.1s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.04)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isPending}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 13,
              border: "none",
              background: isPending ? "rgba(130,192,204,0.4)" : "#82C0CC",
              color: "#1A1916",
              fontWeight: 500,
              cursor: isPending ? "not-allowed" : "pointer",
              transition: "background 0.1s",
            }}
          >
            {isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
