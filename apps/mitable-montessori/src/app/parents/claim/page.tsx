"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ClaimPage() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/parents/claim", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Claim failed (${res.status})`);
      }
      router.push("/parents");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="space-y-3 py-12 text-center">
        <h1 className="font-display text-xl">Missing invitation token</h1>
        <p className="text-sm text-ink/60">
          Use the link from your invitation email. If it&apos;s lost or expired, ask the school to
          send a new one.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 py-6">
      <h1 className="font-display text-2xl">Set your password</h1>
      <p className="text-sm text-ink/60">
        We&apos;ll create your account using the email the school added for you.
      </p>
      <Input
        type="password"
        autoComplete="new-password"
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="At least 8 characters"
      />
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Setting up…" : "Create account"}
      </Button>
    </form>
  );
}
