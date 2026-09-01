"use client";

import * as React from "react";
import { Check, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type GuardianDraft = {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  preferredContactMethod: "email" | "phone" | "either";
  relationship: "mother" | "father" | "guardian" | "other";
  primary: boolean;
  receivesReports: boolean;
  accountActive: boolean;
};

type ChildDraft = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string;
  birthDate: string;
  sex: string;
  notes: string;
  guardians: GuardianDraft[];
};

const emptyGuardian = (): GuardianDraft => ({
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  preferredContactMethod: "either",
  relationship: "guardian",
  primary: false,
  receivesReports: true,
  accountActive: false,
});

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? "Could not save changes");
  return body;
}

function cleanGuardian(g: GuardianDraft): GuardianDraft {
  return {
    ...g,
    firstName: g.firstName.trim(),
    lastName: g.lastName.trim(),
    email: g.email.trim(),
    phone: g.phone.trim(),
  };
}

function guardianError(g: GuardianDraft): string | null {
  const clean = cleanGuardian(g);
  if (!clean.firstName || !clean.lastName) return "Enter the guardian's first and last name.";
  if (clean.email && !/^\S+@\S+\.\S+$/.test(clean.email)) return "Enter a valid email address.";
  return null;
}

export function ChildEditorDialog({
  open,
  studentId,
  onOpenChange,
  onSaved,
  showGuardians = false,
}: {
  open: boolean;
  studentId: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  /** Guardian management lives in the Guardians tab on Child Detail. */
  showGuardians?: boolean;
}) {
  const [draft, setDraft] = React.useState<ChildDraft | null>(null);
  const [removedGuardianIds, setRemovedGuardianIds] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !studentId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDraft(null);
    setRemovedGuardianIds([]);
    void apiJson<{ student: ChildDraft }>(`/api/admin/students/${studentId}`)
      .then((result) => {
        if (!cancelled) setDraft(result.student);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load child");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, studentId]);

  const updateGuardian = (index: number, patch: Partial<GuardianDraft>) => {
    setDraft((current) => {
      if (!current) return current;
      const guardians = current.guardians.map((guardian, i) =>
        i === index ? { ...guardian, ...patch } : guardian
      );
      return { ...current, guardians };
    });
  };

  const makePrimary = (index: number) => {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        guardians: current.guardians.map((guardian, i) => ({ ...guardian, primary: i === index })),
      };
    });
  };

  const removeGuardian = (index: number) => {
    setDraft((current) => {
      if (!current) return current;
      const removed = current.guardians[index];
      if (removed.id) setRemovedGuardianIds((ids) => [...ids, removed.id!]);
      const guardians = current.guardians.filter((_, i) => i !== index);
      if (removed.primary && guardians.length > 0)
        guardians[0] = { ...guardians[0], primary: true };
      return { ...current, guardians };
    });
  };

  const save = async () => {
    if (!draft || !studentId) return;
    const firstName = draft.firstName.trim();
    const lastName = draft.lastName.trim();
    if (!firstName || !lastName) {
      setError("Enter the child's first and last name.");
      return;
    }
    if (showGuardians) {
      for (const guardian of draft.guardians) {
        const message = guardianError(guardian);
        if (message) {
          setError(message);
          return;
        }
      }
    }

    setSaving(true);
    setError(null);
    try {
      await apiJson(`/api/admin/students/${studentId}`, {
        method: "PATCH",
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          preferred_name: draft.preferredName.trim() || null,
          birth_date: draft.birthDate || null,
          sex: draft.sex.trim() || null,
          notes: draft.notes.trim() || null,
        }),
      });

      if (showGuardians) {
        for (const guardianId of removedGuardianIds) {
          await apiJson("/api/admin/student-guardians", {
            method: "DELETE",
            body: JSON.stringify({ student_id: studentId, guardian_id: guardianId }),
          });
        }
        for (const guardian of draft.guardians) {
          const clean = cleanGuardian(guardian);
          let guardianId = clean.id;
          if (guardianId) {
            await apiJson(`/api/admin/guardians/${guardianId}`, {
              method: "PATCH",
              body: JSON.stringify({
                first_name: clean.firstName,
                last_name: clean.lastName,
                email: clean.email || undefined,
                phone: clean.phone || undefined,
                preferred_contact_method: clean.preferredContactMethod,
              }),
            });
          } else {
            const created = await apiJson<{ id: string }>("/api/admin/guardians", {
              method: "POST",
              body: JSON.stringify({
                first_name: clean.firstName,
                last_name: clean.lastName,
                email: clean.email || undefined,
                phone: clean.phone || undefined,
                preferred_contact_method: clean.preferredContactMethod,
              }),
            });
            guardianId = created.id;
            await apiJson("/api/admin/student-guardians", {
              method: "POST",
              body: JSON.stringify({
                student_id: studentId,
                guardian_id: guardianId,
                relationship: clean.relationship,
                is_primary_contact: clean.primary,
                receives_reports: clean.receivesReports,
              }),
            });
          }
          if (clean.id) {
            await apiJson("/api/admin/student-guardians", {
              method: "PATCH",
              body: JSON.stringify({
                student_id: studentId,
                guardian_id: guardianId,
                relationship: clean.relationship,
                is_primary_contact: clean.primary,
                receives_reports: clean.receivesReports,
              }),
            });
          }
        }
      }

      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-[680px] overflow-y-auto rounded-[22px] border border-border bg-surface p-0 shadow-2xl">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle className="text-xl">Edit child</DialogTitle>
          <p className="text-sm text-ink-secondary">Update this child&apos;s details.</p>
        </DialogHeader>
        {loading ? <div className="px-6 py-10 text-sm text-ink-secondary">Loading…</div> : null}
        {error ? (
          <p className="mx-6 mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}
        {draft ? (
          <div className="space-y-6 px-6 py-5">
            <section className="space-y-3">
              <p className="label-cap text-ink-muted">Child</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="First name">
                  <Input
                    value={draft.firstName}
                    onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
                  />
                </Field>
                <Field label="Last name">
                  <Input
                    value={draft.lastName}
                    onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
                  />
                </Field>
                <Field label="Preferred name">
                  <Input
                    value={draft.preferredName}
                    onChange={(e) => setDraft({ ...draft, preferredName: e.target.value })}
                  />
                </Field>
                <Field label="Birthday">
                  <Input
                    type="date"
                    value={draft.birthDate}
                    onChange={(e) => setDraft({ ...draft, birthDate: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Notes">
                <Textarea
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                />
              </Field>
            </section>

            {showGuardians ? (
              <section className="space-y-3 border-t border-border pt-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="label-cap text-ink-muted">Guardians</p>
                    <p className="mt-1 text-sm text-ink-secondary">
                      Add as many guardians as this child needs.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setDraft({ ...draft, guardians: [...draft.guardians, emptyGuardian()] })
                    }
                  >
                    <Plus className="h-4 w-4" /> Add guardian
                  </Button>
                </div>
                {draft.guardians.length === 0 ? (
                  <p className="rounded-lg bg-canvas px-3 py-3 text-sm text-ink-secondary">
                    No guardians have been added yet.
                  </p>
                ) : null}
                {draft.guardians.map((guardian, index) => (
                  <div
                    key={guardian.id ?? `new-${index}`}
                    className="space-y-3 rounded-xl border border-border bg-canvas p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-ink">Guardian {index + 1}</p>
                      <button
                        type="button"
                        className="tap rounded-md p-1.5 text-ink-muted hover:bg-ink/5 hover:text-status-error"
                        aria-label={`Remove guardian ${index + 1}`}
                        onClick={() => removeGuardian(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="First name">
                        <Input
                          value={guardian.firstName}
                          onChange={(e) => updateGuardian(index, { firstName: e.target.value })}
                        />
                      </Field>
                      <Field label="Last name">
                        <Input
                          value={guardian.lastName}
                          onChange={(e) => updateGuardian(index, { lastName: e.target.value })}
                        />
                      </Field>
                      <Field label="Email">
                        <Input
                          type="email"
                          value={guardian.email}
                          disabled={guardian.accountActive}
                          onChange={(e) => updateGuardian(index, { email: e.target.value })}
                        />
                      </Field>
                      <Field label="Phone">
                        <Input
                          type="tel"
                          value={guardian.phone}
                          onChange={(e) => updateGuardian(index, { phone: e.target.value })}
                        />
                      </Field>
                      <Field label="Relationship">
                        <select
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={guardian.relationship}
                          onChange={(e) =>
                            updateGuardian(index, {
                              relationship: e.target.value as GuardianDraft["relationship"],
                            })
                          }
                        >
                          <option value="mother">Mother</option>
                          <option value="father">Father</option>
                          <option value="guardian">Guardian</option>
                          <option value="other">Other</option>
                        </select>
                      </Field>
                      <Field label="Preferred contact">
                        <select
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={guardian.preferredContactMethod}
                          onChange={(e) =>
                            updateGuardian(index, {
                              preferredContactMethod: e.target
                                .value as GuardianDraft["preferredContactMethod"],
                            })
                          }
                        >
                          <option value="either">Email or phone</option>
                          <option value="email">Email</option>
                          <option value="phone">Phone</option>
                        </select>
                      </Field>
                    </div>
                    {guardian.accountActive ? (
                      <p className="text-xs text-ink-secondary">
                        This guardian has an active parent account, so their sign-in email cannot be
                        changed here.
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-4 text-sm text-ink-secondary">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="primary-guardian"
                          checked={guardian.primary}
                          onChange={() => makePrimary(index)}
                        />{" "}
                        Primary contact
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={guardian.receivesReports}
                          onChange={(e) =>
                            updateGuardian(index, { receivesReports: e.target.checked })
                          }
                        />{" "}
                        Receives reports
                      </label>
                    </div>
                  </div>
                ))}
              </section>
            ) : null}
          </div>
        ) : null}
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-surface px-6 py-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={!draft || saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
      <span>{label}</span>
      {children}
    </label>
  );
}

export type GuardianEditorValue = GuardianDraft;

type GuardianSearchMatch = Pick<
  GuardianDraft,
  "id" | "firstName" | "lastName" | "email" | "phone" | "preferredContactMethod" | "accountActive"
>;

export function GuardianEditorDialog({
  open,
  studentId,
  guardian,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  studentId: string;
  guardian: GuardianEditorValue | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = React.useState<GuardianDraft>(emptyGuardian());
  const [inviteGuardian, setInviteGuardian] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchMatches, setSearchMatches] = React.useState<GuardianSearchMatch[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [linkingExisting, setLinkingExisting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setDraft(guardian ? { ...guardian } : emptyGuardian());
    setInviteGuardian(false);
    setSearchQuery("");
    setSearchMatches([]);
    setSearching(false);
    setLinkingExisting(false);
    setError(null);
  }, [open, guardian]);

  React.useEffect(() => {
    if (!open || guardian?.id || linkingExisting || searchQuery.trim().length < 2) {
      setSearchMatches([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      const params = new URLSearchParams({ q: searchQuery.trim(), student_id: studentId });
      void fetch(`/api/admin/guardians/search?${params}`, {
        credentials: "include",
        signal: controller.signal,
      })
        .then(async (response) => {
          const body = (await response.json()) as {
            guardians?: GuardianSearchMatch[];
            error?: string;
          };
          if (!response.ok) throw new Error(body.error ?? "Could not search guardians");
          setSearchMatches(body.guardians ?? []);
        })
        .catch((searchError) => {
          if (!controller.signal.aborted) {
            setError(
              searchError instanceof Error ? searchError.message : "Could not search guardians"
            );
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [guardian?.id, linkingExisting, open, searchQuery, studentId]);

  const selectExistingGuardian = (match: GuardianSearchMatch) => {
    setDraft({
      ...emptyGuardian(),
      ...match,
    });
    setLinkingExisting(true);
    setSearchMatches([]);
    setInviteGuardian(false);
    setError(null);
  };

  const save = async () => {
    const clean = cleanGuardian(draft);
    const validationError = guardianError(clean);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (inviteGuardian && !clean.email) {
      setError("Add an email address before inviting this guardian.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let guardianId = clean.id;
      if (guardianId && linkingExisting) {
        await apiJson("/api/admin/student-guardians", {
          method: "POST",
          body: JSON.stringify({
            student_id: studentId,
            guardian_id: guardianId,
            relationship: clean.relationship,
            is_primary_contact: clean.primary,
            receives_reports: clean.receivesReports,
          }),
        });
      } else if (guardianId) {
        await apiJson(`/api/admin/guardians/${guardianId}`, {
          method: "PATCH",
          body: JSON.stringify({
            first_name: clean.firstName,
            last_name: clean.lastName,
            email: clean.email || undefined,
            phone: clean.phone || undefined,
            preferred_contact_method: clean.preferredContactMethod,
          }),
        });
        await apiJson("/api/admin/student-guardians", {
          method: "PATCH",
          body: JSON.stringify({
            student_id: studentId,
            guardian_id: guardianId,
            relationship: clean.relationship,
            is_primary_contact: clean.primary,
            receives_reports: clean.receivesReports,
          }),
        });
      } else {
        const created = await apiJson<{ id: string }>("/api/admin/guardians", {
          method: "POST",
          body: JSON.stringify({
            first_name: clean.firstName,
            last_name: clean.lastName,
            email: clean.email || undefined,
            phone: clean.phone || undefined,
            preferred_contact_method: clean.preferredContactMethod,
          }),
        });
        guardianId = created.id;
        await apiJson("/api/admin/student-guardians", {
          method: "POST",
          body: JSON.stringify({
            student_id: studentId,
            guardian_id: guardianId,
            relationship: clean.relationship,
            is_primary_contact: clean.primary,
            receives_reports: clean.receivesReports,
          }),
        });
      }
      if (inviteGuardian && guardianId) {
        await apiJson(`/api/admin/guardians/${guardianId}/invite`, { method: "POST" });
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save guardian");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] rounded-[22px] border border-border bg-surface p-0 shadow-2xl">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle className="text-xl">
            {guardian?.id ? "Edit guardian" : "Add guardian"}
          </DialogTitle>
          <p className="text-sm text-ink-secondary">
            {guardian?.id
              ? "Update this guardian's details for the child."
              : "Add another guardian for this child."}
          </p>
        </DialogHeader>
        {error ? (
          <p className="mx-6 mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}
        {!guardian?.id ? (
          <div className="border-b border-border px-6 py-4">
            {linkingExisting ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-sage/30 bg-sage/10 px-3 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-sage" />
                  <div className="min-w-0 text-sm">
                    <p className="truncate font-medium text-ink">
                      {draft.firstName} {draft.lastName}
                    </p>
                    <p className="truncate text-xs text-ink-secondary">
                      {draft.email || draft.phone || "Existing guardian"}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraft(emptyGuardian());
                    setLinkingExisting(false);
                    setSearchQuery("");
                  }}
                >
                  Change
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <label htmlFor="guardian-search" className="text-sm font-medium text-ink">
                  Search existing guardians
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                  <Input
                    id="guardian-search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Name or email"
                    className="pl-9 pr-9"
                  />
                  {searching ? (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-muted" />
                  ) : null}
                </div>
                {searchQuery.trim().length >= 2 && !searching ? (
                  <div className="overflow-hidden rounded-xl border border-border">
                    {searchMatches.length > 0 ? (
                      searchMatches.map((match) => (
                        <button
                          key={match.id}
                          type="button"
                          onClick={() => selectExistingGuardian(match)}
                          className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2.5 text-left last:border-b-0 hover:bg-canvas"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-ink">
                              {match.firstName} {match.lastName}
                            </span>
                            <span className="block truncate text-xs text-ink-secondary">
                              {match.email || match.phone || "No contact details"}
                            </span>
                          </span>
                          <span className="text-xs font-medium text-terracotta">Select</span>
                        </button>
                      ))
                    ) : (
                      <p className="px-3 py-3 text-sm text-ink-secondary">
                        No unlinked guardians found. Enter details below to create a new one.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
        <div className="grid gap-3 px-6 py-5 sm:grid-cols-2">
          <Field label="First name">
            <Input
              value={draft.firstName}
              disabled={linkingExisting}
              onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
            />
          </Field>
          <Field label="Last name">
            <Input
              value={draft.lastName}
              disabled={linkingExisting}
              onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={draft.email}
              disabled={draft.accountActive || linkingExisting}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
          </Field>
          <Field label="Phone">
            <Input
              type="tel"
              value={draft.phone}
              disabled={linkingExisting}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            />
          </Field>
          <Field label="Relationship">
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={draft.relationship}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  relationship: e.target.value as GuardianDraft["relationship"],
                })
              }
            >
              <option value="mother">Mother</option>
              <option value="father">Father</option>
              <option value="guardian">Guardian</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Preferred contact">
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={draft.preferredContactMethod}
              disabled={linkingExisting}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  preferredContactMethod: e.target.value as GuardianDraft["preferredContactMethod"],
                })
              }
            >
              <option value="either">Email or phone</option>
              <option value="email">Email</option>
              <option value="phone">Phone</option>
            </select>
          </Field>
          {draft.accountActive ? (
            <p className="sm:col-span-2 text-xs text-ink-secondary">
              This guardian has an active parent account, so their sign-in email cannot be changed
              here.
            </p>
          ) : null}
          {!draft.accountActive ? (
            <div className="sm:col-span-2 rounded-lg bg-canvas px-3 py-3 text-sm text-ink-secondary">
              <label className="flex items-center gap-2 font-medium text-ink">
                <input
                  type="checkbox"
                  checked={inviteGuardian}
                  disabled={!draft.email.trim()}
                  onChange={(e) => setInviteGuardian(e.target.checked)}
                />
                Invite guardian
              </label>
              <p className="mt-1 text-xs">
                {draft.email.trim()
                  ? `Send an account setup link to ${draft.email.trim()}.`
                  : "Add an email address to send an account setup link."}
              </p>
            </div>
          ) : null}
          <div className="sm:col-span-2 flex flex-wrap gap-4 text-sm text-ink-secondary">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.primary}
                onChange={(e) => setDraft({ ...draft, primary: e.target.checked })}
              />{" "}
              Primary contact
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.receivesReports}
                onChange={(e) => setDraft({ ...draft, receivesReports: e.target.checked })}
              />{" "}
              Receives reports
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : linkingExisting ? "Link guardian" : "Save guardian"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
