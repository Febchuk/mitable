import * as React from "react";

type Props = {
  overline: string;
  title: string;
  accent?: string;
  mobile?: boolean;
};

export function SectionHeading({ overline, title, accent, mobile }: Props) {
  return (
    <div style={{ padding: mobile ? "20px 16px 6px" : "26px 28px 10px" }}>
      <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 4 }}>
        {overline}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h2
          style={{
            fontSize: mobile ? 18 : 20,
            fontWeight: 600,
            margin: 0,
            color: "var(--color-ink)",
            letterSpacing: "-0.005em",
          }}
        >
          {title}
        </h2>
        {accent && (
          <span className="font-display" style={{ fontSize: 19, color: "var(--color-ink-muted)" }}>
            {accent}
          </span>
        )}
      </div>
    </div>
  );
}
