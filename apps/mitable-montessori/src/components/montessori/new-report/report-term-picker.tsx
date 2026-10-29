"use client";

import * as React from "react";
import type { SchoolTerm } from "@/lib/queries/school-terms";

export function ReportTermPicker({
  onContinue,
  submitting,
}: {
  onContinue: (termId?: string) => void;
  submitting?: boolean;
}) {
  const [terms, setTerms] = React.useState<SchoolTerm[]>([]);
  const [termId, setTermId] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [retry, setRetry] = React.useState(0);
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetch("/api/v1/school-terms", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Couldn't load school terms");
        if (!cancelled) {
          setTerms(body.terms);
          setTermId(body.defaultTermId ?? "");
        }
      })
      .catch((caught) => {
        if (!cancelled)
          setError(caught instanceof Error ? caught.message : "Couldn't load school terms");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [retry]);
  return (
    <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
      <p style={{ color: "var(--color-ink-secondary)", fontSize: 14, margin: 0 }}>
        Choose the same term used on the Grades screen. The report will include that term’s grades,
        comment and progress.
      </p>
      {loading ? (
        <p role="status">Loading school terms…</p>
      ) : error ? (
        <div role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="nr-btn nr-btn-ghost"
            onClick={() => setRetry((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      ) : terms.length ? (
        <label style={{ display: "grid", gap: 8, fontSize: 14 }}>
          Report term
          <select
            aria-label="Report term"
            value={termId}
            disabled={submitting}
            onChange={(event) => setTermId(event.target.value)}
            style={{
              minWidth: 0,
              width: "100%",
              padding: "12px",
              border: "1px solid var(--color-border)",
              borderRadius: 9,
              background: "var(--color-surface)",
              font: "inherit",
            }}
          >
            {terms.map((term) => (
              <option key={term.id} value={term.id}>
                {term.name} · {term.startDate} – {term.endDate}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p>No school terms are configured yet. This report will use the current reporting dates.</p>
      )}
      <button
        type="button"
        className="nr-btn nr-btn-primary"
        disabled={loading || !!error || !!submitting || (terms.length > 0 && !termId)}
        onClick={() => onContinue(termId || undefined)}
      >
        {submitting ? "Starting…" : "Start end-of-term report"}
      </button>
    </div>
  );
}
