"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeStudentRedirect, studentLoginEmail } from "@/lib/tests/student-login";
import { createClient } from "@/utils/supabase/client";

export default function StudentLoginPage() {
  return (
    <Suspense fallback={null}>
      <StudentLoginInner />
    </Suspense>
  );
}

function StudentLoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await createClient().auth.signInWithPassword({
      email: studentLoginEmail(code),
      password: password.trim(),
    });
    setBusy(false);
    if (signInError) {
      setError(
        "That code and password don't match. Check them, or ask your teacher for a new one."
      );
      return;
    }
    router.push(safeStudentRedirect(params.get("redirect")) ?? "/student");
    router.refresh();
  };

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-5 py-10">
      <header>
        <h1 className="font-display text-3xl">Sign in to your tests</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          Use the code and password your teacher gave you.
        </p>
      </header>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Code
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoCapitalize="characters"
            autoComplete="username"
            required
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Password
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <Button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
