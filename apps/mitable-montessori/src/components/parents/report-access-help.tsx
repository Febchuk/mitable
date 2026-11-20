"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import { safeParentRedirect } from "@/lib/parents/redirect";
export function ReportAccessHelp({ destination }: { destination: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="mx-auto max-w-md py-10">
      <h1 className="font-display text-3xl">Let’s get you to your report</h1>
      <p className="mt-4 text-sm leading-6 text-ink-secondary">
        This report isn’t available to the account currently signed in. Use the email address your
        school sends reports to. If it still doesn’t appear, ask the school to check that email
        address on your family’s account.
      </p>
      <Button
        className="mt-6"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await createClient().auth.signOut();
          if (result.error) {
            setError("Could not sign out. Please try again.");
            setBusy(false);
            return;
          }
          router.replace(
            `/parents/login?redirect=${encodeURIComponent(safeParentRedirect(destination) ?? "/parents/reports")}`
          );
          router.refresh();
        }}
      >
        {busy ? "Opening sign in…" : "Sign in with the report email"}
      </Button>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}
