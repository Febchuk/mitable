import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ padding: "26px 28px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8, color: "var(--color-ink)" }}>
        Child not found
      </h1>
      <p style={{ fontSize: 13.5, color: "var(--color-ink-secondary)", marginBottom: 16 }}>
        This child may have been archived or you may not have access.
      </p>
      <Link
        href="/app/roster"
        style={{ fontSize: 12.5, color: "var(--color-ink-muted)", textDecoration: "underline" }}
      >
        Back to all children
      </Link>
    </div>
  );
}
