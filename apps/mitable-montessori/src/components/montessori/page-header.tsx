"use client";

import * as React from "react";

export function PageHeader({
  overline,
  title,
  subtitle,
  actions,
}: {
  overline?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: "22px 24px 14px",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      {overline && (
        <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 6 }}>
          {overline}
        </div>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 600,
              color: "var(--color-ink)",
              letterSpacing: "-0.01em",
              margin: 0,
              lineHeight: 1.15,
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <div
              style={{
                fontSize: 13,
                color: "var(--color-ink-secondary)",
                marginTop: 4,
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
        {actions && <div style={{ display: "flex", gap: 8 }}>{actions}</div>}
      </div>
    </div>
  );
}

export const cardStyle: React.CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 14,
  overflow: "hidden",
};

export const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "14px 18px",
  borderBottom: "1px solid var(--color-border)",
};

export function FilterChips({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map((t) => {
        const isActive = value === t;
        return (
          <button
            key={t}
            type="button"
            className="tap"
            onClick={() => onChange(t)}
            style={{
              fontSize: 12,
              fontWeight: 500,
              padding: "6px 12px",
              borderRadius: 999,
              background: isActive ? "var(--color-ink)" : "var(--color-surface)",
              color: isActive ? "var(--color-surface)" : "var(--color-ink-secondary)",
              border: isActive ? "1px solid var(--color-ink)" : "1px solid var(--color-border)",
            }}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}
