"use client";

import Link from "next/link";
import * as React from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AuthHero, AuthHeroMobile } from "@/components/auth/auth-hero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { passwordResetAudience, passwordResetCallbackUrl } from "@/lib/auth/password-reset";
import { createClient } from "@/utils/supabase/client";

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordInner />
    </Suspense>
  );
}

function ForgotPasswordInner() {
  const params = useSearchParams();
  const audience = passwordResetAudience(params.get("audience"));
  const loginHref = audience === "parent" ? "/parents/login" : "/login";
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: resetError } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: passwordResetCallbackUrl(window.location.origin, audience),
    });
    setBusy(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  };

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <AuthHero />
      <AuthHeroMobile />
      <section className="flex items-center justify-center px-6 py-12 lg:px-12">
        <div className="flex w-full max-w-[420px] flex-col gap-5">
          <header>
            <h1 className="font-display text-5xl font-medium leading-none text-ink">
              Reset your password
            </h1>
            <p className="mt-2 text-[0.9375rem] text-ink/70">
              Enter your sign-in email and we&apos;ll send you a secure reset link.
            </p>
          </header>

          {sent ? (
            <div className="rounded-xl border border-sage/30 bg-sage/10 px-4 py-4 text-sm text-ink">
              If an account exists for <strong>{email.trim()}</strong>, a password reset link is on
              its way. Check your inbox and spam folder.
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <label htmlFor="reset-email" className="flex flex-col gap-1.5 text-sm font-medium">
                Email
                <Input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  autoFocus
                />
              </label>
              {error ? <p className="text-sm text-red-700">{error}</p> : null}
              <Button type="submit" size="lg" disabled={busy}>
                {busy ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          )}

          <Link
            href={loginHref}
            className="text-center text-sm text-ink-secondary underline underline-offset-4"
          >
            Back to sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
