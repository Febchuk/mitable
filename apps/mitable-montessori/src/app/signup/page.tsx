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

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupInner />
    </Suspense>
  );
}

function SignupInner() {
  const supabase = createClient();
  const router = useRouter();
  const params = useSearchParams();

  // When a Google sign-in succeeds but the user has no `users` row yet, the
  // OAuth callback bounces them here with provider=google&email=... so they
  // can finish creating their school without setting a password.
  const provider = params.get("provider");
  const prefilledEmail = params.get("email") ?? "";
  const isGoogleFlow = provider === "google";

  const [schoolName, setSchoolName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState(prefilledEmail);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/schools/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        schoolName,
        firstName,
        lastName,
        email,
        // For the Google flow the user already has an auth account, so we
        // skip the password and the API route just creates the school + users
        // row tied to their existing auth.users.id.
        password: isGoogleFlow ? undefined : password,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      redirect?: string;
    };
    if (!res.ok || !json.ok) {
      setBusy(false);
      setError(json.error ?? "Could not create your school. Please try again.");
      return;
    }

    if (!isGoogleFlow) {
      // Sign the new admin in with the password they just set so the next
      // request has a valid session.
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInErr) {
        setBusy(false);
        setError(signInErr.message);
        return;
      }
    }
    // Google-flow user is already authenticated.

    router.push(json.redirect ?? "/onboarding/privacy");
    router.refresh();
  }

  async function handleGoogle() {
    setGoogleBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setGoogleBusy(false);
      setError(error.message);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <AuthHero />
      <AuthHeroMobile />

      <section className="flex items-center justify-center px-6 py-12 lg:px-12">
        <div className="flex w-full max-w-[420px] flex-col gap-5">
          <header>
            <h1 className="font-display text-5xl font-medium leading-none text-ink">
              Start your school
            </h1>
            <p className="mt-2 text-[0.9375rem] text-ink/70">
              {isGoogleFlow
                ? "Welcome! Tell us about your school to finish setting up your admin account."
                : "Create your Mitable account — you'll be the first admin."}
            </p>
          </header>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="school" className="text-[0.8125rem] font-medium text-ink">
                School name
              </label>
              <Input
                id="school"
                type="text"
                placeholder="Sunrise Montessori"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                required
                autoComplete="organization"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="firstName" className="text-[0.8125rem] font-medium text-ink">
                  First name
                </label>
                <Input
                  id="firstName"
                  type="text"
                  placeholder="Maria"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  autoComplete="given-name"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="lastName" className="text-[0.8125rem] font-medium text-ink">
                  Last name
                </label>
                <Input
                  id="lastName"
                  type="text"
                  placeholder="Montessori"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  autoComplete="family-name"
                />
              </div>
            </div>

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
                readOnly={isGoogleFlow}
              />
              {isGoogleFlow ? (
                <p className="text-xs text-ink/50">From your Google account</p>
              ) : null}
            </div>

            {!isGoogleFlow ? (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="password" className="text-[0.8125rem] font-medium text-ink">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
            ) : null}

            {error ? <p className="text-sm text-red-700">{error}</p> : null}

            <Button type="submit" size="lg" disabled={busy || googleBusy}>
              {busy ? "Creating your school…" : "Create your school"}
            </Button>
          </form>

          {!isGoogleFlow ? (
            <>
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
            </>
          ) : null}

          <p className="text-center text-sm text-ink/70">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-terracotta underline decoration-terracotta/40 underline-offset-2 hover:decoration-terracotta"
            >
              Sign in →
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
