"use client";

import * as React from "react";
import { LEVELS, LEVEL_TONES, type Level } from "../mock-data";
import { CloseIcon, ExpandIcon } from "../icons";

/** Shape the spider needs for each axis: a level it can plot + descriptors for the popover. */
export type SpiderAxis = {
  key: string;
  label: string;
  level: Level;
  /** Display string for "last updated" — empty allowed. */
  updated: string;
  descriptors: Record<Level, string>;
};

type SpiderProps = {
  axes: SpiderAxis[];
  size?: number;
  onAxisHover: (key: string) => void;
  hoveredKey: string | null;
  mobile: boolean;
};

export function Spider({ axes, size = 360, onAxisHover, hoveredKey, mobile }: SpiderProps) {
  const cx = size / 2;
  const cy = size / 2;
  const labelPad = mobile ? 64 : 92;
  const r = size / 2 - labelPad;
  const rings = 4;

  const angleFor = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;

  const polygonPoints = axes.map((a, i) => {
    const lvlIdx = LEVELS.indexOf(a.level) + 1;
    const radius = (r * lvlIdx) / rings;
    const ang = angleFor(i);
    return [cx + radius * Math.cos(ang), cy + radius * Math.sin(ang)] as [number, number];
  });

  const polyStr = polygonPoints.map((p) => p.join(",")).join(" ");

  const ringPolys: string[] = [];
  for (let lvl = 1; lvl <= rings; lvl++) {
    const pts = axes
      .map((_, i) => {
        const ang = angleFor(i);
        const radius = (r * lvl) / rings;
        return `${cx + radius * Math.cos(ang)},${cy + radius * Math.sin(ang)}`;
      })
      .join(" ");
    ringPolys.push(pts);
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      height="100%"
      style={{ display: "block", overflow: "visible" }}
      role="img"
      aria-label="7-axis whole-child assessment spider chart"
    >
      {ringPolys.map((pts, i) => (
        <polygon
          key={i}
          points={pts}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={i === ringPolys.length - 1 ? 1.2 : 1}
          strokeDasharray={i === ringPolys.length - 1 ? "none" : "2 4"}
          opacity={i === ringPolys.length - 1 ? 0.85 : 0.55}
        />
      ))}

      {axes.map((a, i) => {
        const ang = angleFor(i);
        return (
          <line
            key={a.key}
            x1={cx}
            y1={cy}
            x2={cx + r * Math.cos(ang)}
            y2={cy + r * Math.sin(ang)}
            stroke="var(--color-border)"
            strokeWidth={1}
            opacity={0.7}
          />
        );
      })}

      <polygon
        points={polyStr}
        fill="var(--color-sage)"
        fillOpacity={0.18}
        stroke="var(--color-sage-deep)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />

      {polygonPoints.map(([x, y], i) => {
        const isHovered = hoveredKey === axes[i].key;
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={isHovered ? 5.5 : 3.5}
            fill="var(--color-surface)"
            stroke="var(--color-sage-deep)"
            strokeWidth={1.6}
            style={{ transition: "r 160ms ease" }}
          />
        );
      })}

      {axes.map((a, i) => {
        const ang = angleFor(i);
        const lx = cx + (r + (mobile ? 16 : 24)) * Math.cos(ang);
        const ly = cy + (r + (mobile ? 16 : 24)) * Math.sin(ang);
        const isActive = hoveredKey === a.key;

        let anchor: "start" | "middle" | "end" = "middle";
        if (lx < cx - 8) anchor = "end";
        else if (lx > cx + 8) anchor = "start";

        const spaceParts = a.label.split(" ");
        let wrapParts: [string, string] | null = null;
        if (spaceParts.length > 1 && a.label.length > 12) {
          wrapParts = [spaceParts[0], spaceParts.slice(1).join(" ")];
        } else if (a.label.includes("-") && a.label.length > 13) {
          const idx = a.label.indexOf("-");
          wrapParts = [a.label.slice(0, idx + 1), a.label.slice(idx + 1)];
        }
        const dy1 = wrapParts ? -5 : 4;
        const labelClass = isActive
          ? "spider-axis-label spider-axis-label-active"
          : "spider-axis-label";

        return (
          <g
            key={a.key}
            style={{ cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              onAxisHover(a.key);
            }}
          >
            <line
              x1={cx}
              y1={cy}
              x2={lx}
              y2={ly}
              stroke="transparent"
              strokeWidth={mobile ? 32 : 44}
            />
            {wrapParts ? (
              <text x={lx} y={ly} textAnchor={anchor} className={labelClass}>
                <tspan x={lx} dy={dy1}>
                  {wrapParts[0]}
                </tspan>
                <tspan x={lx} dy="13">
                  {wrapParts[1]}
                </tspan>
              </text>
            ) : (
              <text x={lx} y={ly + 4} textAnchor={anchor} className={labelClass}>
                {a.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

type SpiderCardProps = {
  axes: SpiderAxis[];
  mobile: boolean;
  size?: number;
  selectedAxis: string | null;
  onSelectAxis: (key: string | null) => void;
};

export function SpiderCard({ axes, mobile, size, selectedAxis, onSelectAxis }: SpiderCardProps) {
  const handleAxisClick = (key: string) => {
    onSelectAxis(key === selectedAxis ? null : key);
  };
  const finalSize = size || (mobile ? 340 : 460);
  return (
    <div className="spider-card">
      <div style={{ width: "100%", aspectRatio: "1 / 1", position: "relative" }}>
        <Spider
          axes={axes}
          size={finalSize}
          onAxisHover={handleAxisClick}
          hoveredKey={selectedAxis}
          mobile={mobile}
        />
      </div>
    </div>
  );
}

type HeroProps = SpiderCardProps & {
  onExpand?: () => void;
  showExpand?: boolean;
};

export function SpiderHeroCard({
  axes,
  mobile,
  size,
  selectedAxis,
  onSelectAxis,
  onExpand,
  showExpand = false,
}: HeroProps) {
  const finalSize = size || (mobile ? 300 : 520);
  return (
    <div style={{ position: "relative", width: "100%" }}>
      {showExpand && (
        <button
          type="button"
          className="tap"
          onClick={onExpand}
          aria-label="Expand spider chart"
          title="Expand"
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            width: 32,
            height: 32,
            borderRadius: 10,
            border: "1px solid var(--color-border)",
            background: "var(--color-canvas)",
            color: "var(--color-ink-secondary)",
            display: "grid",
            placeItems: "center",
            zIndex: 2,
          }}
        >
          <ExpandIcon />
        </button>
      )}
      <div
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          maxWidth: finalSize,
          margin: "0 auto",
        }}
      >
        <Spider
          axes={axes}
          size={finalSize}
          onAxisHover={(key) => onSelectAxis(key === selectedAxis ? null : key)}
          hoveredKey={selectedAxis}
          mobile={mobile || false}
        />
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 11,
          color: "var(--color-ink-muted)",
          fontStyle: "italic",
          textAlign: "center",
        }}
      >
        {selectedAxis ? "Tap the same axis again to clear" : "Tap an axis to filter observations"}
      </div>
    </div>
  );
}

export function AxisDescriptorInline({ axes, axisKey }: { axes: SpiderAxis[]; axisKey: string }) {
  const axis = axes.find((a) => a.key === axisKey);
  if (!axis) return null;
  const t = LEVEL_TONES[axis.level];
  return (
    <div
      key={axisKey}
      className="anim-slide-up"
      style={{
        marginTop: 14,
        padding: "12px 14px",
        background: t.soft,
        border: `1px solid ${t.tone}`,
        borderRadius: 12,
      }}
    >
      <div className="label-cap" style={{ color: t.deep, marginBottom: 4 }}>
        {axis.label} · {axis.level}
      </div>
      <div style={{ fontSize: 13, color: "var(--color-ink)", lineHeight: 1.45 }}>
        {axis.descriptors[axis.level]}
      </div>
      {axis.updated && (
        <div style={{ fontSize: 11, color: "var(--color-ink-muted)", marginTop: 6 }}>
          Last updated {axis.updated}
        </div>
      )}
    </div>
  );
}

type SpiderModalProps = {
  axes: SpiderAxis[];
  open: boolean;
  onClose: () => void;
  mobile: boolean;
  selectedAxis: string | null;
  onSelectAxis: (key: string | null) => void;
};

export function SpiderModal({
  axes,
  open,
  onClose,
  mobile,
  selectedAxis,
  onSelectAxis,
}: SpiderModalProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="anim-fade-in"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(42, 39, 35, 0.42)",
        zIndex: 80,
        display: "flex",
        alignItems: mobile ? "stretch" : "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        className="anim-slide-up"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface)",
          borderRadius: mobile ? 0 : 18,
          width: mobile ? "100%" : "min(720px, 92%)",
          maxHeight: mobile ? "100%" : "92%",
          overflow: "auto",
          padding: mobile ? "20px 16px 28px" : "26px 28px",
          boxShadow: "0 30px 80px rgba(42,39,35,0.28)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            marginBottom: 8,
          }}
        >
          <div>
            <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 4 }}>
              Whole-child assessment
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--color-ink)" }}>
              Seven dimensions
            </div>
          </div>
          <button
            type="button"
            className="tap"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              border: "1px solid var(--color-border)",
              background: "var(--color-canvas)",
              color: "var(--color-ink-secondary)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <CloseIcon />
          </button>
        </div>

        <div style={{ marginTop: 4 }}>
          <SpiderCard
            axes={axes}
            mobile={mobile}
            selectedAxis={selectedAxis}
            onSelectAxis={onSelectAxis}
          />
        </div>

        {selectedAxis && <AxisDescriptorInline axes={axes} axisKey={selectedAxis} />}
      </div>
    </div>
  );
}
