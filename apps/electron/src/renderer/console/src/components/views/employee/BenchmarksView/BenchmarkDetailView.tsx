import { useEffect, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { useMyBenchmarkDetail } from "@/console/src/hooks/queries/benchmarks";
import type { BenchmarkSnapshot } from "@/console/src/services/benchmarkService";
import { PercentileBadge } from "../../shared/benchmarks/PercentileBadge";
import { CategoryBadge } from "../../shared/benchmarks/CategoryBadge";

// ── Chart drawing ─────────────────────────────────────────────

function abbreviateDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en", { month: "short", day: "numeric" });
}

function drawBarChart(
  canvas: HTMLCanvasElement,
  snapshots: BenchmarkSnapshot[],
  targetValue: number,
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

  if (!snapshots.length) {
    ctx.fillStyle = "var(--text-tertiary)";
    ctx.font = "13px var(--font-sans)";
    ctx.textAlign = "center";
    ctx.fillText("No data yet", W / 2, H / 2);
    return;
  }

  const PADDING_LEFT = 40;
  const PADDING_RIGHT = 16;
  const PADDING_TOP = 16;
  const PADDING_BOTTOM = 28;

  const maxValue = Math.max(targetValue, ...snapshots.map((s) => s.value)) * 1.1;
  const chartW = W - PADDING_LEFT - PADDING_RIGHT;
  const chartH = H - PADDING_TOP - PADDING_BOTTOM;

  const n = snapshots.length;
  const barGroupW = chartW / n;
  const barW = Math.max(8, barGroupW * 0.5);
  const barOffset = (barGroupW - barW) / 2;

  // Draw bars
  ctx.fillStyle = "#82C0CC";
  snapshots.forEach((snap, i) => {
    const barH = (snap.value / maxValue) * chartH;
    const x = PADDING_LEFT + i * barGroupW + barOffset;
    const y = PADDING_TOP + chartH - barH;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, [3, 3, 0, 0]);
    ctx.fill();
  });

  // Dashed target line
  const targetY = PADDING_TOP + chartH - (targetValue / maxValue) * chartH;
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "var(--text-tertiary)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PADDING_LEFT, targetY);
  ctx.lineTo(W - PADDING_RIGHT, targetY);
  ctx.stroke();
  ctx.restore();

  // X-axis labels
  ctx.fillStyle = "var(--text-tertiary)";
  ctx.font = "10px var(--font-sans)";
  ctx.textAlign = "center";
  snapshots.forEach((snap, i) => {
    const x = PADDING_LEFT + i * barGroupW + barGroupW / 2;
    const label = abbreviateDate(snap.date);
    ctx.fillText(label, x, H - 6);
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
          padding: "28px 32px",
          color: "var(--text-tertiary)",
          fontSize: 13,
          fontFamily: "var(--font-sans)",
          textAlign: "center",
          paddingTop: 120,
        }}
      >
        Loading...
      </div>
    );
  }

  if (!detail) return null;

  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        padding: "28px 0",
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
          color: "var(--text-secondary)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          marginBottom: 20,
          fontFamily: "var(--font-sans)",
          transition: "color 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
        }}
      >
        <ArrowLeft size={14} />
        My Benchmarks
      </button>

      {/* Title + category badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 24,
        }}
      >
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
        <CategoryBadge category={detail.category} />
      </div>

      {/* Stats row */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 24,
        }}
      >
        {/* Current Value */}
        <div
          style={{
            flex: 1,
            background: "var(--bg-raised)",
            border: "1px solid var(--border-hairline)",
            borderRadius: 12,
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontFamily: "var(--font-sans)",
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.09em",
            }}
          >
            Current
          </span>
          <span
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 48,
              fontWeight: 300,
              color: "var(--text-primary)",
              lineHeight: 1,
              letterSpacing: "-1px",
            }}
          >
            {detail.currentValue}
          </span>
          <span
            style={{
              fontSize: 12,
              color: "var(--text-tertiary)",
              fontFamily: "var(--font-sans)",
            }}
          >
            {detail.unit}
          </span>
        </div>

        {/* Target */}
        <div
          style={{
            flex: 1,
            background: "var(--bg-raised)",
            border: "1px solid var(--border-hairline)",
            borderRadius: 12,
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontFamily: "var(--font-sans)",
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.09em",
            }}
          >
            Target
          </span>
          <span
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 48,
              fontWeight: 300,
              color: "var(--text-primary)",
              lineHeight: 1,
              letterSpacing: "-1px",
            }}
          >
            {detail.targetValue}
          </span>
          <span
            style={{
              fontSize: 12,
              color: "var(--text-tertiary)",
              fontFamily: "var(--font-sans)",
            }}
          >
            {detail.unit}
          </span>
        </div>

        {/* Percentile */}
        <div
          style={{
            flex: 1,
            background: "var(--bg-raised)",
            border: "1px solid var(--border-hairline)",
            borderRadius: 12,
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontFamily: "var(--font-sans)",
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.09em",
            }}
          >
            Percentile
          </span>
          <div style={{ marginTop: 4 }}>
            <PercentileBadge percentile={detail.percentile} />
          </div>
        </div>
      </div>

      {/* Historical trend chart */}
      <div
        style={{
          background: "var(--bg-raised)",
          border: "1px solid var(--border-hairline)",
          borderRadius: 12,
          padding: 20,
          height: 220,
          marginBottom: 16,
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

      {/* AI Suggestions */}
      {detail.suggestions.length > 0 && (
        <div
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--border-hairline)",
            borderRadius: 12,
            padding: 20,
            marginBottom: 16,
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
              <div
                key={s.id}
                style={{ display: "flex", alignItems: "flex-start", gap: 10 }}
              >
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--text-tertiary)",
                    flexShrink: 0,
                    marginTop: 0,
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

      {/* Accomplishments */}
      {detail.accomplishments.length > 0 && (
        <div
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--border-hairline)",
            borderRadius: 12,
            padding: 20,
            marginBottom: 16,
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
              <div
                key={a.id}
                style={{ display: "flex", alignItems: "flex-start", gap: 10 }}
              >
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
    </div>
  );
}
