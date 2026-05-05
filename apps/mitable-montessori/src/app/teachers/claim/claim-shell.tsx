import * as React from "react";
import { HandUnderline, HandDivider } from "@/components/montessori/primitives";

/** Visual shell shared by every state of the claim page (form, expired,
 * not-found, error). Matches the warm cream/clay aesthetic of /admin/teachers
 * so the invitee feels like they're already inside the same product. */
export function ClaimShell({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--color-canvas)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 18,
          padding: "32px 28px 28px",
          boxShadow: "0 24px 60px rgba(42,39,35,0.08)",
        }}
      >
        <div
          className="label-cap"
          style={{ color: "var(--color-ink-muted)", marginBottom: 10 }}
        >
          {eyebrow}
        </div>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: "var(--color-ink)",
            letterSpacing: "-0.005em",
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {title}
        </h1>
        <HandUnderline width={108} style={{ marginTop: 6 }} />
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.55,
            color: "var(--color-ink-secondary)",
            margin: "16px 0 22px",
          }}
        >
          {body}
        </p>
        {children ? (
          children
        ) : (
          <div style={{ display: "flex", justifyContent: "center", opacity: 0.6, marginTop: 8 }}>
            <HandDivider color="var(--color-clay)" width={180} />
          </div>
        )}
      </div>
    </div>
  );
}
