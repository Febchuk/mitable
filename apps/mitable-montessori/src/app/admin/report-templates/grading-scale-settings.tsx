"use client";

import * as React from "react";
import { GradingScaleSchema, type GradingScale } from "@/lib/grades/grading-scale";
import { cardStyle } from "@/components/montessori/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToastBus } from "@/components/montessori/primitives";

export function GradingScaleSettings() {
  const [values, setValues] = React.useState({ aMin: "", bMin: "", cMin: "" });
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedScale, setSavedScale] = React.useState<GradingScale | null>(null);
  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/grading-scale", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load the grading scale");
      const scale = payload.scale as GradingScale | null;
      setSavedScale(scale);
      if (scale)
        setValues({ aMin: String(scale.aMin), bMin: String(scale.bMin), cMin: String(scale.cMin) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the grading scale");
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => {
    void load();
  }, [load]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = GradingScaleSchema.safeParse(
      Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)]))
    );
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/grading-scale", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save the grading scale");
      setSavedScale(payload.scale);
      ToastBus.push({ message: "Grading scale saved" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the grading scale");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      style={{ ...cardStyle, padding: 20, marginBottom: 24, maxWidth: 760 }}
      aria-labelledby="grading-scale-heading"
    >
      <h2 id="grading-scale-heading" style={{ fontSize: 17, fontWeight: 600, margin: "0 0 6px" }}>
        Elementary grading scale
      </h2>
      <p style={{ fontSize: 13, color: "var(--color-ink-secondary)", margin: "0 0 16px" }}>
        The overall grade comes from the average of saved subject scores. Set the minimum score for
        each letter; D covers scores below C. Changes apply to new and unsent reports.
      </p>
      {loading ? (
        <p className="text-sm text-ink-muted">Loading grading scale…</p>
      ) : error && !savedScale && values.aMin === "" ? (
        <>
          <p role="alert" className="text-sm text-ink-secondary">
            {error}
          </p>
          <Button variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </>
      ) : (
        <form onSubmit={(event) => void save(event)}>
          <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
            <div
              style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}
            >
              {(
                [
                  ["aMin", "A"],
                  ["bMin", "B"],
                  ["cMin", "C"],
                ] as const
              ).map(([key, letter]) => (
                <label key={key} style={{ display: "grid", gap: 6 }}>
                  <span className="label-cap text-ink-muted">{letter} minimum (%)</span>
                  <Input
                    type="number"
                    min="0.01"
                    max="100"
                    step="0.01"
                    required
                    value={values[key]}
                    onChange={(event) => {
                      setValues((current) => ({ ...current, [key]: event.target.value }));
                      setError(null);
                    }}
                  />
                </label>
              ))}
            </div>
            {error ? (
              <p role="alert" className="mt-3 text-sm text-ink-secondary">
                {error}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button type="submit">{busy ? "Saving…" : "Save grading scale"}</Button>
              <span className="text-xs text-ink-muted">
                {savedScale
                  ? `Current: A ≥ ${savedScale.aMin} · B ≥ ${savedScale.bMin} · C ≥ ${savedScale.cMin} · D < ${savedScale.cMin}`
                  : "No scale set yet"}
              </span>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}
