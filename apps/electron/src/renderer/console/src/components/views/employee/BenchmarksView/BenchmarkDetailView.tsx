import { useEffect, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { useMyBenchmarkDetail } from "@/console/src/hooks/queries/benchmarks";
import type { BenchmarkSnapshot } from "@/console/src/services/benchmarkService";

// ── Chart drawing ─────────────────────────────────────────────

function abbreviateDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en", { month: "short", day: "numeric" });
}

function getCssColor(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function drawBarChart(
  canvas: HTMLCanvasElement,
  snapshots: BenchmarkSnapshot[],
  targetValue: number
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const W = rect.width;
  const H = rect.height;

  ctx.clearRect(0, 0, W, H);

  const textTertiary = getCssColor("--text-tertiary", "#6B665C");
  const textFaint = getCssColor("--text-faint", "#4A4640");
  const barColor = "#B8DDE4";

  if (!snapshots.length) {
    ctx.fillStyle = textTertiary;
    ctx.font = "13px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No data yet", W / 2, H / 2);
    return;
  }

  const PADDING_LEFT = 48;
  const PADDING_RIGHT = 20;
  const PADDING_TOP = 20;
  const PADDING_BOTTOM = 36;

  const maxValue = 100;
  const steps = [0, 20, 40, 60, 80, 100];

  const chartW = W - PADDING_LEFT - PADDING_RIGHT;
  const chartH = H - PADDING_TOP - PADDING_BOTTOM;

  const n = snapshots.length;
  const barGroupW = chartW / n;
  const barW = Math.min(Math.max(6, barGroupW * 0.4), 20);
  const barOffset = (barGroupW - barW) / 2;

  // Horizontal grid lines + Y-axis labels
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.font = "11px Inter, sans-serif";
  for (const step of steps) {
    const y = PADDING_TOP + chartH - (step / maxValue) * chartH;
    // Grid line
    ctx.strokeStyle = `rgba(236, 232, 224, 0.06)`;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(PADDING_LEFT, y);
    ctx.lineTo(W - PADDING_RIGHT, y);
    ctx.stroke();
    // Label
    ctx.fillStyle = textTertiary;
    ctx.fillText(String(Math.round(step)), PADDING_LEFT - 10, y);
  }

  // Draw bars
  snapshots.forEach((snap, i) => {
    const barH = Math.max(2, (snap.value / maxValue) * chartH);
    const x = PADDING_LEFT + i * barGroupW + barOffset;
    const y = PADDING_TOP + chartH - barH;
    ctx.fillStyle = barColor;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, [3, 3, 0, 0]);
    ctx.fill();
  });

  // Dashed target line
  const targetY = PADDING_TOP + chartH - (targetValue / maxValue) * chartH;
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = textFaint;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PADDING_LEFT, targetY);
  ctx.lineTo(W - PADDING_RIGHT, targetY);
  ctx.stroke();
  ctx.restore();

  // X-axis labels
  ctx.fillStyle = textTertiary;
  ctx.font = "11px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  snapshots.forEach((snap, i) => {
    const x = PADDING_LEFT + i * barGroupW + barGroupW / 2;
    ctx.fillText(abbreviateDate(snap.date), x, PADDING_TOP + chartH + 10);
  });
}

// ── Component ─────────────────────────────────────────────────

export function BenchmarkDetailView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: detail, isLoading } = useMyBenchmarkDetail(id ?? "");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!detail || !canvasRef.current) return;
    drawBarChart(canvasRef.current, detail.history, detail.targetValue);
  }, [detail]);

  if (isLoading) {
    return (
      <div
        style={{
          height: "100vh",
          overflowY: "auto",
          paddingTop: 120,
          paddingRight: 0,
          paddingBottom: 28,
          paddingLeft: 0,
          color: "var(--text-tertiary)",
          fontSize: 13,
          fontFamily: "var(--font-sans)",
          textAlign: "center",
        }}
      >
        Loading...
      </div>
    );
  }

  if (!detail) return null;

  const trendValue =
    detail.trend === "improving"
      ? `+${Math.abs(detail.trendDelta).toFixed(1)}%`
      : detail.trend === "declining"
        ? `-${Math.abs(detail.trendDelta).toFixed(1)}%`
        : "0%";

  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        padding: "28px 0",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      {/* Back link */}
      <button
        onClick={() => navigate("/benchmarks")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          color: "var(--text-tertiary)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          fontFamily: "var(--font-sans)",
          alignSelf: "flex-start",
          transition: "color 0.1s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--text-secondary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--text-tertiary)";
        }}
      >
        <ArrowLeft size={14} />
        My Benchmarks
      </button>

      {/* Name */}
      <h1
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 26,
          fontWeight: 400,
          color: "var(--text-primary)",
          letterSpacing: "-0.3px",
          margin: 0,
        }}
      >
        {detail.name}
      </h1>

      {/* Description */}
      {detail.description && (
        <p
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            margin: 0,
            lineHeight: 1.6,
            fontFamily: "var(--font-sans)",
          }}
        >
          {detail.description}
        </p>
      )}

      {/* Inline metrics — Score + Trend */}
      <div style={{ display: "flex", gap: 48, alignItems: "baseline" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            style={{
              fontSize: 10,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.09em",
              fontFamily: "var(--font-sans)",
            }}
          >
            Score
          </span>
          <span
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 48,
              fontWeight: 300,
              color: "var(--text-primary)",
              letterSpacing: -2,
              lineHeight: 1,
            }}
          >
            {Math.round(detail.progress)}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            style={{
              fontSize: 10,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.09em",
              fontFamily: "var(--font-sans)",
            }}
          >
            Trend
          </span>
          <span
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 48,
              fontWeight: 300,
              letterSpacing: -2,
              lineHeight: 1,
              color:
                detail.trend === "improving"
                  ? "#3A9B6B"
                  : detail.trend === "declining"
                    ? "#D4A27A"
                    : "var(--text-primary)",
            }}
          >
            {trendValue}
          </span>
        </div>
      </div>

      {/* Historical trend chart */}
      <div
        style={{
          background: "var(--bg-raised)",
          border: "var(--border-hairline)",
          borderRadius: 12,
          padding: 20,
          height: 280,
          position: "relative",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
          }}
        />
      </div>

      {/* Accomplishments */}
      {detail.accomplishments.length > 0 && (
        <div
          style={{
            background: "var(--bg-raised)",
            border: "var(--border-hairline)",
            borderRadius: 12,
            padding: 20,
          }}
        >
          <p
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "var(--text-primary)",
              fontFamily: "var(--font-sans)",
              margin: "0 0 14px",
            }}
          >
            Accomplishments
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {detail.accomplishments.map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--text-tertiary)",
                    flexShrink: 0,
                    lineHeight: 1.5,
                  }}
                >
                  &bull;
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span
                    style={{
                      fontSize: 13,
                      color: "var(--text-primary)",
                      fontFamily: "var(--font-sans)",
                      lineHeight: 1.5,
                    }}
                  >
                    {a.text}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--text-tertiary)",
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    {abbreviateDate(a.date)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggestions */}
      {detail.suggestions.length > 0 && (
        <div
          style={{
            background: "var(--bg-raised)",
            border: "var(--border-hairline)",
            borderRadius: 12,
            padding: 20,
          }}
        >
          <p
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "var(--text-primary)",
              fontFamily: "var(--font-sans)",
              margin: "0 0 14px",
            }}
          >
            Suggestions
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {detail.suggestions.map((s) => (
              <div key={s.id} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--text-tertiary)",
                    flexShrink: 0,
                    lineHeight: 1.5,
                  }}
                >
                  &bull;
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-sans)",
                    lineHeight: 1.5,
                  }}
                >
                  {s.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
