"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, LogOut } from "lucide-react";
import { clearDb } from "@/lib/db/schema";
import { clearSessionKeys } from "@/lib/crypto/session-key";

export interface UserMenuProps {
  email: string;
  /** First name from the user profile. Used as the primary label when set. */
  firstName?: string | null;
  /** e.g. "Lead guide", "Admin". Shown under the name in the trigger row. */
  roleLabel?: string;
  /**
   * Trigger style.
   *  - `icon` — a 32×32 avatar button (used in mobile / parents headers).
   *  - `row`  — a full clickable identity card (used in the desktop sidebar footer).
   */
  variant?: "icon" | "row";
  /** Where the popup pops relative to the trigger. */
  direction?: "up" | "down";
  /** Horizontal alignment of the popup. */
  align?: "left" | "right";
}

/**
 * Account menu shared across the app. The popup mirrors the warm cream / ink
 * palette of the rest of the Montessori surfaces — identity at the top, the
 * teacher's role surfaced as a chip, and a single destructive Sign-out below
 * a hairline divider.
 *
 * On sign-out:
 *   1. POST /api/auth/logout — clears the Supabase auth cookies server-side.
 *   2. Clear the local Dexie cache + session crypto keys so the next user
 *      doesn't inherit the previous user's encrypted roster.
 *   3. router.push to /login.
 */
export function UserMenu({
  email,
  firstName,
  roleLabel,
  variant = "icon",
  direction = "down",
  align = "right",
}: UserMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const router = useRouter();
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (e.target instanceof Node && containerRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open]);

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

  const localPart = email.split("@")[0] ?? email;
  const fallbackName = localPart.length ? localPart[0].toUpperCase() + localPart.slice(1) : email;
  const displayName = firstName?.trim() || fallbackName;
  const initial = (firstName?.[0] || email[0] || "?").toUpperCase();

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", width: variant === "row" ? "100%" : undefined }}
    >
      {variant === "row" ? (
        <RowTrigger
          open={open}
          onClick={() => setOpen((v) => !v)}
          initial={initial}
          displayName={displayName}
          secondary={roleLabel ?? email}
        />
      ) : (
        <IconTrigger open={open} onClick={() => setOpen((v) => !v)} initial={initial} />
      )}

      {open ? (
        <Popup
          direction={direction}
          align={align}
          /** Sidebar is narrow (~204px); a fixed 268px menu clips at the rail edge. */
          matchTriggerWidth={variant === "row"}
          initial={initial}
          displayName={displayName}
          email={email}
          roleLabel={roleLabel}
          busy={busy}
          onSignOut={signOut}
        />
      ) : null}
    </div>
  );
}

function IconTrigger({
  open,
  onClick,
  initial,
}: {
  open: boolean;
  onClick: () => void;
  initial: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label="Account menu"
      style={{
        width: 32,
        height: 32,
        borderRadius: 999,
        background: "var(--color-ink)",
        color: "var(--color-surface)",
        border: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        outline: open ? "2px solid var(--color-terracotta-soft)" : "none",
        outlineOffset: 2,
      }}
    >
      {initial}
    </button>
  );
}

function RowTrigger({
  open,
  onClick,
  initial,
  displayName,
  secondary,
}: {
  open: boolean;
  onClick: () => void;
  initial: string;
  displayName: string;
  secondary: string;
}) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-haspopup="menu"
      aria-expanded={open}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 10px",
        background: open
          ? "var(--color-canvas)"
          : hover
            ? "var(--color-canvas)"
            : "var(--color-surface)",
        border: open ? "1px solid var(--color-border-strong)" : "1px solid var(--color-border)",
        borderRadius: 12,
        cursor: "pointer",
        textAlign: "left",
        transition: "background 120ms ease, border-color 120ms ease",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 32,
          height: 32,
          borderRadius: 999,
          background: "var(--color-ink)",
          color: "var(--color-surface)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {initial}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--color-ink)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            lineHeight: 1.25,
          }}
        >
          {displayName}
        </span>
        <span
          style={{
            display: "block",
            fontSize: 11,
            color: "var(--color-ink-muted)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            lineHeight: 1.4,
            marginTop: 1,
          }}
        >
          {secondary}
        </span>
      </span>
      <ChevronsUpDown
        size={14}
        strokeWidth={1.5}
        style={{
          color: "var(--color-ink-muted)",
          flexShrink: 0,
          opacity: open || hover ? 1 : 0.7,
        }}
      />
    </button>
  );
}

function Popup({
  direction,
  align,
  matchTriggerWidth,
  initial,
  displayName,
  email,
  roleLabel,
  busy,
  onSignOut,
}: {
  direction: "up" | "down";
  align: "left" | "right";
  /** When true, menu spans the trigger (sidebar row); avoids clipping past the rail. */
  matchTriggerWidth: boolean;
  initial: string;
  displayName: string;
  email: string;
  roleLabel?: string;
  busy: boolean;
  onSignOut: () => void;
}) {
  return (
    <div
      role="menu"
      style={{
        position: "absolute",
        zIndex: 40,
        boxSizing: "border-box",
        width: matchTriggerWidth ? "100%" : 268,
        maxWidth: matchTriggerWidth ? "100%" : "min(268px, calc(100vw - 24px))",
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 14,
        boxShadow: "0 16px 36px rgba(42,39,35,0.14), 0 4px 12px rgba(42,39,35,0.06)",
        overflow: "hidden",
        ...(align === "right" ? { right: 0 } : { left: 0 }),
        ...(direction === "up" ? { bottom: "calc(100% + 8px)" } : { top: "calc(100% + 8px)" }),
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 16px 12px",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            background: "var(--color-ink)",
            color: "var(--color-surface)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {initial}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--color-ink)",
              letterSpacing: "-0.005em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              lineHeight: 1.25,
            }}
          >
            {displayName}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--color-ink-muted)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              marginTop: 2,
              lineHeight: 1.35,
            }}
            title={email}
          >
            {email}
          </div>
        </div>
      </div>

      {roleLabel ? (
        <div style={{ padding: "0 16px 14px" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px 4px 8px",
              background: "var(--color-sage-soft)",
              color: "var(--color-sage-deep)",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.01em",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: "var(--color-sage)",
                display: "inline-block",
              }}
            />
            {roleLabel}
          </span>
        </div>
      ) : null}

      <div
        aria-hidden="true"
        style={{
          height: 1,
          background: "var(--color-border)",
          margin: "0 12px",
        }}
      />

      <SignOutButton busy={busy} onClick={onSignOut} />
    </div>
  );
}

function SignOutButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      disabled={busy}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 16px",
        background: hover && !busy ? "var(--color-clay-soft)" : "transparent",
        color: "var(--color-terracotta-deep)",
        border: 0,
        cursor: busy ? "default" : "pointer",
        fontSize: 13,
        fontWeight: 500,
        textAlign: "left",
        transition: "background 120ms ease",
      }}
    >
      <LogOut size={15} strokeWidth={1.75} />
      <span>{busy ? "Signing out…" : "Sign out"}</span>
    </button>
  );
}
