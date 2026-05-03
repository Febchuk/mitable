"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, ServerOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const STEPS = [
  {
    icon: Lock,
    title: "Names stay on this device",
    body: "Your roster, guardian list, and observations are encrypted in your browser. The server never sees plaintext PII.",
  },
  {
    icon: ServerOff,
    title: "AI sees tokens, not names",
    body: "When you capture a quick observation, names like 'Lina' become tokens like '[STUDENT_1]' before any model call.",
  },
  {
    icon: ShieldCheck,
    title: "You approve every change",
    body: "The model proposes structured updates as cards in the chat. Nothing is recorded until you tap Approve.",
  },
] as const;

export default function PrivacyOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAcknowledge() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/onboarding/privacy", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      router.push("/app/today");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const current = STEPS[step];
  const Icon = current.icon;
  const last = step === STEPS.length - 1;

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-terracotta/15 text-terracotta">
            <Icon className="h-6 w-6" />
          </div>
          <CardTitle className="text-center font-display text-2xl">{current.title}</CardTitle>
          <CardDescription className="text-center">{current.body}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex justify-center gap-1">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-6 rounded-full ${i === step ? "bg-terracotta" : "bg-ink/15"}`}
              />
            ))}
          </div>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <div className="flex justify-end gap-2">
            {!last ? (
              <Button onClick={() => setStep((s) => s + 1)}>Next</Button>
            ) : (
              <Button onClick={handleAcknowledge} disabled={busy}>
                {busy ? "Saving…" : "I understand — let's go"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
