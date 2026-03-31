import React from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  variant?: "default" | "inline";
  style?: React.CSSProperties;
}

export function EmptyState({
  title,
  description,
  actions,
  variant = "default",
  style,
}: EmptyStateProps) {
  if (variant === "inline") {
    return (
      <div
        style={{
          padding: "32px 0",
          textAlign: "center",
          ...style,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text-secondary)",
          }}
        >
          {title}
        </span>
        {description && (
          <p
            style={{
              fontSize: 12,
              color: "var(--text-tertiary)",
              lineHeight: 1.5,
              marginTop: 4,
            }}
          >
            {description}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        border: "var(--border-hairline)",
        borderRadius: 10,
        padding: "32px 24px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        ...style,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text-secondary)",
          }}
        >
          {title}
        </span>
        {description && (
          <span
            style={{
              fontSize: 12,
              color: "var(--text-tertiary)",
              lineHeight: 1.5,
              maxWidth: 300,
              textAlign: "center",
            }}
          >
            {description}
          </span>
        )}
      </div>
      {actions && (
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {actions}
        </div>
      )}
    </div>
  );
}
