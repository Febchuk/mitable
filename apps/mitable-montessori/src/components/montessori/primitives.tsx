"use client";

import * as React from "react";
import type { Tone } from "./data";

export const HandUnderline = ({
  color = "var(--color-terracotta)",
  width = 120,
  style,
}: {
  color?: string;
  width?: number;
  style?: React.CSSProperties;
}) => (
  <svg width={width} height={10} viewBox="0 0 120 10" style={{ display: "block", ...style }}>
    <path
      d="M2 6 C 22 2, 48 9, 72 4 S 110 7, 118 5"
      fill="none"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
    />
  </svg>
);

export const HandCheck = ({
  color = "var(--color-sage)",
  size = 22,
}: {
  color?: string;
  size?: number;
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M3.5 12.5 C 6 14, 8 16.5, 10 19 C 13 13, 17 7.5, 22 4"
      stroke={color}
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const HandDivider = ({
  color = "var(--color-clay)",
  width = "100%",
}: {
  color?: string;
  width?: string | number;
}) => (
  <svg
    viewBox="0 0 200 8"
    preserveAspectRatio="none"
    style={{ width, height: 8, display: "block" }}
  >
    <path
      d="M2 5 C 50 2, 100 7, 150 3 S 198 5, 198 5"
      stroke={color}
      strokeWidth={1.4}
      fill="none"
      strokeLinecap="round"
      opacity={0.7}
    />
  </svg>
);

const TONE_MAP: Record<Tone, { bg: string; fg: string }> = {
  clay: { bg: "var(--color-clay-soft)", fg: "var(--color-terracotta-deep)" },
  sage: { bg: "var(--color-sage-soft)", fg: "var(--color-sage-deep)" },
  butter: { bg: "var(--color-butter-soft)", fg: "var(--color-butter-deep)" },
  blue: { bg: "var(--color-dusty-blue-soft)", fg: "#33526E" },
  terracotta: { bg: "var(--color-terracotta-soft)", fg: "var(--color-terracotta-deep)" },
};

export function Avatar({
  initials,
  tone = "clay",
  size = 36,
}: {
  initials: string;
  tone?: Tone;
  size?: number;
}) {
  const t = TONE_MAP[tone] ?? TONE_MAP.clay;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: t.bg,
        color: t.fg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 600,
        fontSize: Math.max(10, size * 0.36),
        letterSpacing: "0.02em",
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

export function VoiceWave({
  color = "var(--color-surface)",
  animated = false,
}: {
  color?: string;
  animated?: boolean;
}) {
  const bars = [3, 6, 11, 8, 14, 18, 13, 9, 16, 12, 7, 14, 19, 11, 6, 4, 9, 13, 7, 4];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, height: 22 }}>
      {bars.map((h, i) => (
        <div
          key={i}
          style={{
            width: 2.5,
            height: h,
            background: color,
            opacity: 0.85,
            borderRadius: 2,
            animation: animated
              ? `wave-bar ${0.7 + (i % 5) * 0.07}s ease-in-out ${i * 0.04}s infinite`
              : "none",
            transformOrigin: "center",
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Toast bus + host                                                  */
/* ------------------------------------------------------------------ */

export type ToastInput = {
  message: string;
  icon?: React.ReactNode;
  duration?: number;
};

type ToastInstance = ToastInput & { id: string };

type ToastListener = (t: ToastInput) => void;

const subs = new Set<ToastListener>();

export const ToastBus = {
  push(t: ToastInput) {
    subs.forEach((fn) => fn(t));
  },
  subscribe(fn: ToastListener) {
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
  },
};

export function ToastHost() {
  const [toasts, setToasts] = React.useState<ToastInstance[]>([]);
  React.useEffect(
    () =>
      ToastBus.subscribe((t) => {
        const id = Math.random().toString(36).slice(2);
        setToasts((prev) => [...prev, { id, ...t }]);
        const ttl = t.duration ?? 3200;
        window.setTimeout(() => {
          setToasts((prev) => prev.filter((x) => x.id !== id));
        }, ttl);
      }),
    []
  );
  return (
    <div
      style={{
        position: "fixed",
        top: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            background: "var(--color-ink)",
            color: "var(--color-surface)",
            padding: "10px 14px 10px 12px",
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            gap: 10,
            boxShadow: "0 18px 40px rgba(42,39,35,0.25), 0 6px 14px rgba(42,39,35,0.12)",
            fontSize: 13,
            fontWeight: 500,
            animation: "toast-in 200ms cubic-bezier(0.2,0.8,0.2,1) both",
            maxWidth: 360,
            pointerEvents: "auto",
          }}
        >
          {t.icon ? (
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                background: "rgba(255,251,243,0.16)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {t.icon}
            </div>
          ) : null}
          <div>{t.message}</div>
        </div>
      ))}
    </div>
  );
}
