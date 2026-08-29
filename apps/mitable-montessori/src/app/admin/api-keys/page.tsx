"use client";

import * as React from "react";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { PageHeader, cardStyle } from "@/components/montessori/page-header";
import { ToastBus } from "@/components/montessori/primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type ApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: Array<"read" | "write">;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
};

function displayDate(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function keyStatus(key: ApiKey) {
  if (key.revoked_at) return "Revoked";
  if (key.expires_at && new Date(key.expires_at) <= new Date()) return "Expired";
  return "Active";
}

async function copyToClipboard(value: string) {
  await navigator.clipboard.writeText(value);
  ToastBus.push({ message: "Copied to clipboard" });
}

export default function AdminApiKeysPage() {
  const [keys, setKeys] = React.useState<ApiKey[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [newSecret, setNewSecret] = React.useState<string | null>(null);
  const [pendingRevoke, setPendingRevoke] = React.useState<ApiKey | null>(null);
  const [revoking, setRevoking] = React.useState(false);

  const refresh = React.useCallback(async () => {
    try {
      const response = await fetch("/api/admin/api-keys", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as {
        apiKeys?: ApiKey[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Couldn't load API keys");
      setKeys(data.apiKeys ?? []);
    } catch (error) {
      ToastBus.push({ message: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    try {
      const response = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          scopes: ["read", "write"],
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { secret?: string; error?: string };
      if (!response.ok || !data.secret) throw new Error(data.error ?? "Couldn't create API key");
      setCreateOpen(false);
      setName("");
      setExpiresAt("");
      setNewSecret(data.secret);
      await refresh();
    } catch (error) {
      ToastBus.push({ message: (error as Error).message });
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey() {
    if (!pendingRevoke) return;
    setRevoking(true);
    try {
      const response = await fetch(`/api/admin/api-keys/${pendingRevoke.id}`, { method: "DELETE" });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Couldn't revoke API key");
      setPendingRevoke(null);
      ToastBus.push({ message: "API key revoked" });
      await refresh();
    } catch (error) {
      ToastBus.push({ message: (error as Error).message });
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="API Keys"
        subtitle="Create credentials for trusted integrations. Each key can read and write records for this school only."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} aria-hidden />
            Create key
          </Button>
        }
      />

      <div style={{ padding: 24, display: "grid", gap: 16, maxWidth: 980 }}>
        <div
          style={{
            padding: "14px 16px",
            background: "var(--color-clay-soft)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            color: "var(--color-ink-secondary)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          Keys are shown only once when created. Store them in your integration’s secret manager,
          never in a browser or source code repository.
        </div>

        {loading ? (
          <p style={{ color: "var(--color-ink-muted)", fontSize: 14 }}>Loading…</p>
        ) : keys.length === 0 ? (
          <div
            style={{
              ...cardStyle,
              padding: 28,
              textAlign: "center",
              color: "var(--color-ink-secondary)",
            }}
          >
            <KeyRound
              size={24}
              style={{ margin: "0 auto 10px", color: "var(--color-terracotta)" }}
              aria-hidden
            />
            <div style={{ fontWeight: 600, color: "var(--color-ink)" }}>No API keys yet</div>
            <p style={{ fontSize: 13, margin: "6px 0 0" }}>
              Create one when you’re ready to connect a trusted system.
            </p>
          </div>
        ) : (
          <div style={cardStyle}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
                  <th style={tableHeaderStyle}>Name</th>
                  <th style={tableHeaderStyle}>Key</th>
                  <th style={tableHeaderStyle}>Status</th>
                  <th style={tableHeaderStyle}>Last used</th>
                  <th style={tableHeaderStyle}>Expires</th>
                  <th style={{ ...tableHeaderStyle, width: 72 }} />
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => {
                  const status = keyStatus(key);
                  return (
                    <tr key={key.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={tableCellStyle}>{key.name}</td>
                      <td style={{ ...tableCellStyle, fontFamily: "var(--font-mono, monospace)" }}>
                        {key.key_prefix}…
                      </td>
                      <td style={tableCellStyle}>
                        <span style={statusStyle(status)}>{status}</span>
                      </td>
                      <td style={{ ...tableCellStyle, color: "var(--color-ink-secondary)" }}>
                        {displayDate(key.last_used_at)}
                      </td>
                      <td style={{ ...tableCellStyle, color: "var(--color-ink-secondary)" }}>
                        {key.expires_at ? displayDate(key.expires_at) : "Never"}
                      </td>
                      <td style={tableCellStyle}>
                        {status === "Active" ? (
                          <button
                            type="button"
                            className="tap"
                            aria-label={`Revoke ${key.name}`}
                            title="Revoke key"
                            onClick={() => setPendingRevoke(key)}
                            style={iconButtonStyle}
                          >
                            <Trash2 size={16} aria-hidden />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="border-ink/10 bg-canvas">
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>
              Give the integration a recognizable name. It will have read and write access for this
              school.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createKey} className="mt-5 grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium text-ink">
              Name
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="SIS integration"
                autoFocus
                required
                maxLength={80}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-ink">
              Optional expiry
              <Input
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
            </label>
            <div className="mt-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? "Creating…" : "Create key"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={newSecret !== null} onOpenChange={(open) => !open && setNewSecret(null)}>
        <DialogContent className="border-ink/10 bg-canvas">
          <DialogHeader>
            <DialogTitle>Copy your new API key</DialogTitle>
            <DialogDescription>
              This is the only time it will be displayed. Copy it now and store it securely.
            </DialogDescription>
          </DialogHeader>
          <code className="mt-5 block break-all rounded-md bg-ink/5 p-3 text-xs text-ink">
            {newSecret}
          </code>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setNewSecret(null)}>
              I’ve stored it
            </Button>
            <Button type="button" onClick={() => newSecret && void copyToClipboard(newSecret)}>
              <Copy size={16} aria-hidden />
              Copy key
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingRevoke !== null}
        onOpenChange={(open) => !open && setPendingRevoke(null)}
      >
        <DialogContent className="border-ink/10 bg-canvas">
          <DialogHeader>
            <DialogTitle>Revoke this API key?</DialogTitle>
            <DialogDescription>
              {pendingRevoke?.name} will stop working immediately. This cannot be undone; create a
              replacement key if needed.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingRevoke(null)}
              disabled={revoking}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void revokeKey()}
              disabled={revoking}
            >
              {revoking ? "Revoking…" : "Revoke key"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const tableHeaderStyle: React.CSSProperties = {
  padding: "12px 16px",
  fontWeight: 600,
  color: "var(--color-ink-muted)",
};

const tableCellStyle: React.CSSProperties = { padding: "13px 16px" };

const iconButtonStyle: React.CSSProperties = {
  display: "inline-grid",
  placeItems: "center",
  width: 30,
  height: 30,
  borderRadius: 7,
  border: "none",
  background: "transparent",
  color: "var(--color-ink-muted)",
  cursor: "pointer",
};

function statusStyle(status: string): React.CSSProperties {
  const active = status === "Active";
  return {
    display: "inline-flex",
    padding: "3px 7px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    color: active ? "var(--color-sage-deep)" : "var(--color-ink-secondary)",
    background: active ? "var(--color-sage-soft)" : "var(--color-muted)",
  };
}
