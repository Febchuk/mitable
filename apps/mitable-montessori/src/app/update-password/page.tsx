"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { AuthHero, AuthHeroMobile } from "@/components/auth/auth-hero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { passwordResetAudience } from "@/lib/auth/password-reset";
import { createClient } from "@/utils/supabase/client";

export default function UpdatePasswordPage() {
  return (
    <Suspense fallback={null}>
      <UpdatePasswordInner />
    </Suspense>
  );
}

function UpdatePasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const audience = passwordResetAudience(params.get("audience"));
  const loginHref =
    audience === "parent" ? "/parents/login?password=updated" : "/login?password=updated";
  const [password, setPassword] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");
  const [showPasswords, setShowPasswords] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setBusy(false);
      setError(
        updateError.message.toLowerCase().includes("session")
          ? "This reset link is invalid or has expired. Request a new one."
          : updateError.message
      );
      return;
    }

    await supabase.auth.signOut();
    router.replace(loginHref);
    router.refresh();
  };

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <AuthHero />
      <AuthHeroMobile />
      <section className="flex items-center justify-center px-6 py-12 lg:px-12">
        <div className="flex w-full max-w-[420px] flex-col gap-5">
          <header>
            <h1 className="font-display text-5xl font-medium leading-none text-ink">
              Choose a new password
            </h1>
            <p className="mt-2 text-[0.9375rem] text-ink/70">
              Use at least 8 characters, then sign in again with your new password.
            </p>
          </header>

          <form onSubmit={submit} className="flex flex-col gap-4">
            <label htmlFor="new-password" className="flex flex-col gap-1.5 text-sm font-medium">
              New password
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPasswords ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  required
                  autoFocus
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords((visible) => !visible)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-ink/40 transition-colors hover:text-ink/70"
                  aria-label={showPasswords ? "Hide passwords" : "Show passwords"}
                  aria-pressed={showPasswords}
                >
                  {showPasswords ? (
                    <EyeOff size={18} strokeWidth={1.5} />
                  ) : (
                    <Eye size={18} strokeWidth={1.5} />
                  )}
                </button>
              </div>
            </label>
            <label htmlFor="confirm-password" className="flex flex-col gap-1.5 text-sm font-medium">
              Confirm new password
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showPasswords ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  minLength={8}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords((visible) => !visible)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-ink/40 transition-colors hover:text-ink/70"
                  aria-label={showPasswords ? "Hide passwords" : "Show passwords"}
                  aria-pressed={showPasswords}
                >
                  {showPasswords ? (
                    <EyeOff size={18} strokeWidth={1.5} />
                  ) : (
                    <Eye size={18} strokeWidth={1.5} />
                  )}
                </button>
              </div>
            </label>
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? "Updating…" : "Update password"}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
