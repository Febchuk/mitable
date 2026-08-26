"use client";

import Link from "next/link";
import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/utils/supabase/client";

export default function ParentLoginPage() {
  return (
    <Suspense fallback={null}>
      <ParentLoginInner />
    </Suspense>
  );
}

function ParentLoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const justJoined = params.get("welcome") === "parent";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await createClient().auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.push("/parents/onboarding");
    router.refresh();
  };

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-5 py-10">
      <header>
        <p className="label-cap text-ink-muted">Mitable for families</p>
        <h1 className="mt-2 font-display text-3xl">Welcome back</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          {justJoined
            ? "Your account is ready. Sign in to continue."
            : "Sign in to follow your child's learning."}
        </p>
      </header>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Email
          <Input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Password
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <Button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="text-center text-xs text-ink-muted">
        Need an account? Ask your child&apos;s school to send you an invitation.
      </p>
      <Link
        href="/login"
        className="text-center text-sm text-ink-secondary underline underline-offset-4"
      >
        School staff sign in here
      </Link>
    </div>
  );
}
