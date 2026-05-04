export default function Loading() {
  return (
    <div
      style={{ padding: "26px 28px", color: "var(--color-ink-muted)", fontSize: 13 }}
      role="status"
      aria-live="polite"
    >
      Loading roster…
    </div>
  );
}
