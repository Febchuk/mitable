"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ClaimForm({
  token,
  email,
  schoolName,
}: {
  token: string;
  email: string;
  schoolName: string;
}) {
  const router = useRouter();
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    password.length >= 8 &&
    !submitting;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/teachers/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          password,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((json as { error?: string }).error ?? "Something went wrong");
        setSubmitting(false);
        return;
      }
      router.push("/login?welcome=teacher");
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Field label="Sign-in email">
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            background: "var(--color-canvas)",
            border: "1px solid var(--color-border)",
            color: "var(--color-ink-secondary)",
            fontSize: 14,
          }}
        >
          {email}
        </div>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="First name">
          <Input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="e.g. Maya"
            className="h-10 bg-canvas"
            autoFocus
          />
        </Field>
        <Field label="Last name">
          <Input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="e.g. Patel"
            className="h-10 bg-canvas"
          />
        </Field>
      </div>
      <Field label="Password" hint="At least 8 characters.">
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="h-10 bg-canvas"
        />
      </Field>

      {error && (
        <div
          style={{
            fontSize: 12.5,
            color: "var(--color-terracotta-deep)",
            background: "var(--color-terracotta-soft)",
            padding: "8px 10px",
            borderRadius: 8,
          }}
        >
          {error}
        </div>
      )}

      <Button type="submit" disabled={!canSubmit} style={{ marginTop: 4 }}>
        {submitting ? "Setting up…" : `Join ${schoolName}`}
      </Button>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
        {label}
      </span>
      {children}
      {hint && (
        <span style={{ fontSize: 11, color: "var(--color-ink-muted)" }}>{hint}</span>
      )}
    </label>
  );
}
