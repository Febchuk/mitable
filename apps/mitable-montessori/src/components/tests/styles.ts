import type * as React from "react";

export const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--color-border)",
  borderRadius: 9,
  padding: "10px 11px",
  background: "var(--color-surface)",
  color: "var(--color-ink)",
  font: "inherit",
  fontSize: 14,
};

export const primaryButtonStyle: React.CSSProperties = {
  border: "1px solid var(--color-ink)",
  borderRadius: 9,
  padding: "9px 14px",
  background: "var(--color-ink)",
  color: "var(--color-surface)",
  font: "inherit",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

export const quietButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  border: "1px solid var(--color-border)",
  background: "transparent",
  color: "var(--color-ink)",
  fontWeight: 500,
};

export const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 14,
  fontSize: 13,
  fontWeight: 600,
  color: "var(--color-ink)",
};

export const mutedStyle: React.CSSProperties = {
  color: "var(--color-ink-secondary)",
  fontSize: 13,
};

export const errorStyle: React.CSSProperties = {
  color: "#b3261e",
  fontSize: 13,
};
