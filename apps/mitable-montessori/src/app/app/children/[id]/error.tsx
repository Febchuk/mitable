"use client";

import * as React from "react";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  React.useEffect(() => {
    // Surface errors in the dev console so they don't get silently swallowed.
    console.error("[child-detail] route error:", error);
  }, [error]);

  return (
    <div style={{ padding: "26px 28px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8, color: "var(--color-ink)" }}>
        Something went wrong
      </h1>
      <p style={{ fontSize: 13.5, color: "var(--color-ink-secondary)", marginBottom: 16 }}>
        We couldn&apos;t load this child detail page. Try again, or refresh.
      </p>
      <button
        type="button"
        onClick={reset}
        className="primary-btn tap"
        style={{
          padding: "8px 14px",
          background: "var(--color-ink)",
          color: "var(--color-surface)",
          border: "1px solid var(--color-ink)",
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        Try again
      </button>
    </div>
  );
}
