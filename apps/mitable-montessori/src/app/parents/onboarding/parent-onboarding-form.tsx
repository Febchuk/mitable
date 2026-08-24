"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ParentOnboardingForm({ firstName }: { firstName: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const continueToHome = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/parents/onboarding", { method: "POST" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not finish setup");
      }
      router.push("/parents");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 py-10">
      <header>
        <p className="label-cap text-ink-muted">Welcome to Mitable</p>
        <h1 className="mt-2 font-display text-3xl">Hi {firstName}</h1>
        <p className="mt-3 text-sm leading-6 text-ink-secondary">
          This is your private window into your child&apos;s learning. You&apos;ll be able to see
          the children linked to your account, follow their progress, and read reports the school
          shares.
        </p>
      </header>
      <div className="rounded-xl border border-border bg-surface p-4 text-sm leading-6 text-ink-secondary">
        Your school controls what is shared here. If anything looks missing, they can update your
        family&apos;s details.
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <Button type="button" onClick={() => void continueToHome()} disabled={busy}>
        {busy ? "Opening your home…" : "Continue"}
      </Button>
    </div>
  );
}
