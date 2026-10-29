"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminFetch } from "@/lib/visibility/reveal-hidden";
import type { ParentAccessEntry, ParentAccessStatus } from "@/lib/parents/access-directory";

const LABELS: Record<ParentAccessStatus, string> = {
  registered: "Account set up",
  setup_pending: "Account created · setup incomplete",
  invited: "Invite link active",
  expired: "Invite expired",
  not_invited: "Needs invitation",
  missing_email: "Needs email address",
};

export default function ParentDirectoryPage() {
  const [parents, setParents] = React.useState<ParentAccessEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [busy, setBusy] = React.useState<string | null>(null);
  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminFetch("/api/admin/guardians", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load parents");
      setParents(data.parents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load parents");
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => {
    void load();
  }, [load]);

  async function send(parent: ParentAccessEntry, action: "invite" | "reset-password") {
    const label = action === "invite" ? "an invitation" : "a password reset link";
    if (!window.confirm(`Send ${label} to ${parent.email}?`)) return;
    setBusy(parent.id);
    setError(null);
    setNotice(null);
    try {
      const response = await adminFetch(`/api/admin/guardians/${parent.id}/${action}`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not send email");
      await load();
      setNotice(`Sent ${label} to ${parent.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send email");
    } finally {
      setBusy(null);
    }
  }

  const query = search.trim().toLowerCase();
  const visible = parents.filter(
    (parent) =>
      (status === "all" || parent.status === status) &&
      [parent.name, parent.email, parent.phone, ...parent.children.map((child) => child.name)].some(
        (value) => value?.toLowerCase().includes(query)
      )
  );

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <h1 className="font-display text-4xl text-ink">Parents</h1>
      <p className="mt-2 text-sm text-ink-secondary">
        Check who has an account, who needs an invitation, and who can reset their password.
      </p>
      <p className="mt-2 text-sm text-ink-secondary">
        To add a parent or update their details, open their child in the{" "}
        <Link href="/admin/roster" className="underline">
          school roster
        </Link>
        .
      </p>
      <div className="my-6 flex flex-wrap gap-3">
        <Input
          aria-label="Search parents"
          placeholder="Search parent, child, email or phone…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-sm"
        />
        <select
          aria-label="Filter parent access"
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="all">All access statuses</option>
          {Object.entries(LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Button variant="secondary" onClick={() => void load()} disabled={loading || busy !== null}>
          Refresh
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-4 text-sm text-ink">
          {notice}
        </p>
      ) : null}
      {loading ? (
        <p>Loading parents…</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-secondary">
            {visible.length} of {parents.length} parents
          </p>
          <div className="divide-y divide-border rounded-xl border border-border bg-surface">
            {visible.map((parent) => {
              const hasAccount =
                parent.status === "registered" || parent.status === "setup_pending";
              return (
                <section
                  key={parent.id}
                  className="flex flex-wrap items-start justify-between gap-4 p-5"
                >
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold text-ink">{parent.name}</h2>
                    <p className="break-all text-sm text-ink-secondary">
                      {parent.email || "No email address"}
                      {parent.phone ? ` · ${parent.phone}` : ""}
                    </p>
                    <p className="mt-2 text-sm text-ink">{LABELS[parent.status]}</p>
                    {parent.inviteExpiresAt ? (
                      <p className="text-xs text-ink-secondary">
                        Invite expires {new Date(parent.inviteExpiresAt).toLocaleDateString()}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-3 text-sm">
                      {parent.children.length ? (
                        parent.children.map((child) => (
                          <Link
                            key={child.id}
                            href={`/app/children/${child.id}?from=admin-roster`}
                            className="underline"
                          >
                            {child.name}
                          </Link>
                        ))
                      ) : (
                        <span className="text-ink-secondary">No child linked yet</span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    disabled={busy !== null || !parent.email}
                    onClick={() => void send(parent, hasAccount ? "reset-password" : "invite")}
                  >
                    {busy === parent.id
                      ? "Sending…"
                      : hasAccount
                        ? "Send password reset"
                        : parent.status === "invited" || parent.status === "expired"
                          ? "Resend invitation"
                          : "Send invitation"}
                  </Button>
                </section>
              );
            })}
            {!visible.length ? (
              <p className="p-5 text-sm text-ink-secondary">
                {parents.length
                  ? "No parents match this search."
                  : "No parents have been added yet."}
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
