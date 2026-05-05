"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthHero, AuthHeroMobile } from "@/components/auth/auth-hero";
import { GoogleIcon } from "@/components/auth/google-icon";
import { OrDivider } from "@/components/auth/or-divider";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const supabase = createClient();
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") ?? "/app/today";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(redirect);
    router.refresh();
  }

  async function handleGoogle() {
    setGoogleBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
      },
    });
    if (error) {
      setGoogleBusy(false);
      setError(error.message);
    }
    // On success the browser is redirected to Google, so no further state change.
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <AuthHero />
      <AuthHeroMobile />

      <section className="flex items-center justify-center px-6 py-12 lg:px-12">
        <div className="flex w-full max-w-[420px] flex-col gap-5">
          <header>
            <h1 className="font-display text-5xl font-medium leading-none text-ink">
              Welcome back
            </h1>
            <p className="mt-2 text-[0.9375rem] text-ink/70">Sign in to your school.</p>
          </header>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-[0.8125rem] font-medium text-ink">
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@school.example"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between">
                <label htmlFor="password" className="text-[0.8125rem] font-medium text-ink">
                  Password
                </label>
                {/* Forgot-password flow not yet implemented — link is a placeholder. */}
                <span className="text-xs text-ink/40">Forgot?</span>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            {error ? <p className="text-sm text-red-700">{error}</p> : null}

            <Button type="submit" size="lg" disabled={busy || googleBusy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <OrDivider />

          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={handleGoogle}
            disabled={busy || googleBusy}
          >
            <GoogleIcon />
            {googleBusy ? "Redirecting…" : "Continue with Google"}
          </Button>

          <p className="text-center text-sm text-ink/70">
            New to Mitable?{" "}
            <Link
              href="/signup"
              className="font-medium text-terracotta underline decoration-terracotta/40 underline-offset-2 hover:decoration-terracotta"
            >
              Create a school →
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
