"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ParentClaimForm({
  token,
  email,
  schoolName,
}: {
  token: string;
  email: string;
  schoolName: string;
}) {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/parents/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not create your account");
      router.push("/parents/login?welcome=parent");
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
        <span>Sign-in email</span>
        <span className="rounded-md border border-border bg-canvas px-3 py-2.5 text-ink-secondary">
          {email}
        </span>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
        <span>Password</span>
        <Input
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="At least 8 characters"
          className="h-10 bg-canvas"
        />
      </label>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <Button type="submit" disabled={password.length < 8 || submitting}>
        {submitting ? "Setting up…" : `Join ${schoolName}`}
      </Button>
    </form>
  );
}
