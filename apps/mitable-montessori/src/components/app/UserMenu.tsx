"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearDb } from "@/lib/db/schema";
import { clearSessionKeys } from "@/lib/crypto/session-key";

export interface UserMenuProps {
  email: string;
}

/**
 * Header user menu with sign-out. The button intentionally sits next to the
 * ConnectionStatus + PendingBadge so it's always reachable. On click:
 *   1. POST /api/auth/logout — clears the Supabase auth cookies server-side
 *   2. clear local Dexie + session crypto keys so the next user doesn't
 *      inherit the previous user's encrypted roster cache
 *   3. router.push to /login
 */
export function UserMenu({ email }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      // Even if logout 500s, blow away the local cache so we don't leak across users.
    }
    try {
      clearSessionKeys();
      await clearDb();
    } catch {
      // Best-effort.
    }
    router.push("/login");
    router.refresh();
  }

  // Best-effort initial — first letter of the email's local part.
  const initial = (email.split("@")[0]?.[0] ?? "?").toUpperCase();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-canvas hover:bg-ink/90"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <span className="text-xs font-medium">{initial}</span>
      </button>
      {open ? (
        <>
          {/* Click-away */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 top-full z-40 mt-2 w-56 rounded-lg border border-ink/10 bg-canvas p-2 shadow-lg"
          >
            <p className="px-2 pb-2 text-[11px] text-ink/50">Signed in as</p>
            <p className="truncate px-2 pb-2 text-sm font-medium">{email}</p>
            <div className="my-1 h-px bg-ink/10" />
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              disabled={busy}
              className="w-full justify-start"
            >
              <LogOut className="h-4 w-4" />
              {busy ? "Signing out…" : "Sign out"}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
