"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Book,
  Building2,
  HelpCircle,
  LayoutTemplate,
  LogOut,
  MessageSquare,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { CalendarBlank, HouseSimple, PencilSimple, SquaresFour } from "@phosphor-icons/react";
import { ChatThread } from "@/components/chat/ChatThread";
import { clearDb } from "@/lib/db/schema";
import { clearSessionKeys } from "@/lib/crypto/session-key";
import { OnlineToggle } from "./online-toggle";
import { useMontessori } from "./store";

/**
 * Mobile shell for Mitable Montessori.
 *
 *   1. Top bar with a left-side avatar that opens a left sliding drawer.
 *   2. Persistent terracotta chat FAB at bottom-right that opens a bottom
 *      sheet hosting the existing ChatThread.
 *
 * Replaces the previous mobile bottom-tab navigation. Visible on `<lg`
 * screens only — desktop continues to use MontessoriSidebar.
 *
 * Visual language mirrors `_design/mobile-shell-prototype.html`.
 */

type Variant = "teacher" | "admin";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  withDraftBadge?: boolean;
}

const ph = { size: 18, weight: "regular" as const };
const lu = { size: 18, strokeWidth: 1.6 };

const TEACHER_NAV: NavItem[] = [
  { href: "/app/today", label: "Today", icon: <HouseSimple {...ph} /> },
  { href: "/app/roster", label: "Roster", icon: <Users {...lu} /> },
  { href: "/app/curriculum", label: "Curriculum", icon: <Book {...lu} /> },
  { href: "/app/progress", label: "Progress", icon: <SquaresFour {...ph} /> },
  { href: "/app/attendance", label: "Attendance", icon: <CalendarBlank {...ph} /> },
  { href: "/app/reports", label: "Reports", icon: <PencilSimple {...ph} />, withDraftBadge: true },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin/today", label: "Today", icon: <HouseSimple {...ph} /> },
  { href: "/admin/classrooms", label: "Classrooms", icon: <Building2 {...lu} /> },
  { href: "/admin/curriculum", label: "Curriculum", icon: <Book {...lu} /> },
  { href: "/admin/report-templates", label: "Templates", icon: <LayoutTemplate {...lu} /> },
  { href: "/admin/teachers", label: "Teachers", icon: <Users {...lu} /> },
  {
    href: "/admin/reports",
    label: "Reports",
    icon: <PencilSimple {...ph} />,
    withDraftBadge: true,
  },
];

export interface MontessoriMobileShellProps {
  variant: Variant;
  /** First name for the drawer profile block. Falls back to email local part. */
  firstName?: string | null;
  email: string;
  schoolName: string;
  /** Optional context line under the school (e.g. "3 classrooms · 48 children"). */
  schoolSubtitle?: string;
  /** Used to title chat sheet on the teacher side. */
  classroomId?: string | null;
  classroomName?: string;
  schoolId: string;
  userId: string;
}

// Matches /admin/reports/<id> and /app/reports/<id> (and anything nested below
// them), but NOT the bare list pages /admin/reports or /app/reports.
const REPORT_DETAIL_PATTERN = /^\/(?:admin|app)\/reports\/[^/]+/;

export function MontessoriMobileShell(props: MontessoriMobileShellProps) {
  const pathname = usePathname() ?? "";
  const isReportDetail = REPORT_DETAIL_PATTERN.test(pathname);

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const store = useMontessori();
  const sheetOpen = !isReportDetail && store.mobileChatOpen;
  const setMobileChatOpen = store.setMobileChatOpen;
  const setSheetOpen = React.useCallback((v: boolean) => setMobileChatOpen(v), [setMobileChatOpen]);

  // If the user navigates onto a report-detail route while the generic sheet
  // was left open, force it closed — the report editor's own chat takes over here.
  React.useEffect(() => {
    if (isReportDetail && store.mobileChatOpen) {
      setMobileChatOpen(false);
    }
  }, [isReportDetail, store.mobileChatOpen, setMobileChatOpen]);

  // Close drawer on Escape
  React.useEffect(() => {
    if (!drawerOpen && !sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (drawerOpen) setDrawerOpen(false);
      else if (sheetOpen) setSheetOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen, sheetOpen, setSheetOpen]);

  // Lock body scroll while either overlay is up.
  React.useEffect(() => {
    if (!drawerOpen && !sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen, sheetOpen]);

  return (
    <>
      <MobileTopBar
        variant={props.variant}
        firstName={props.firstName}
        email={props.email}
        onAvatarClick={() => setDrawerOpen(true)}
      />

      <MobileScrim
        open={drawerOpen || sheetOpen}
        onClick={() => {
          if (drawerOpen) setDrawerOpen(false);
          else if (sheetOpen) setSheetOpen(false);
        }}
      />

      <MobileDrawer
        open={drawerOpen}
        variant={props.variant}
        firstName={props.firstName}
        email={props.email}
        schoolName={props.schoolName}
        schoolSubtitle={props.schoolSubtitle}
        onDismiss={() => setDrawerOpen(false)}
      />

      {/* On report-detail routes the report editor mounts its own report-scoped
          chat FAB + sheet, so the shell hides this generic one to avoid two FABs. */}
      {!isReportDetail && (
        <>
          <MobileChatSheet
            open={sheetOpen}
            classroomId={props.classroomId ?? null}
            classroomName={props.classroomName ?? props.schoolName}
            schoolId={props.schoolId}
            userId={props.userId}
            onClose={() => setSheetOpen(false)}
          />
          <MobileChatFab hidden={sheetOpen} onClick={() => setSheetOpen(true)} />
        </>
      )}
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Top bar                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

function MobileTopBar({
  firstName,
  email,
  onAvatarClick,
}: {
  variant: Variant;
  firstName?: string | null;
  email: string;
  onAvatarClick: () => void;
}) {
  const initial = (firstName?.[0] || email[0] || "?").toUpperCase();

  return (
    // lg:hidden so the bar never appears alongside the desktop sidebar.
    // Route titles + subtitles are owned by <PageHeader> in the body — this
    // bar deliberately carries no title to avoid a duplicated heading.
    <header
      className="lg:hidden"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        height: 52,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 12px",
        background: "color-mix(in srgb, var(--color-canvas) 90%, transparent)",
        backdropFilter: "blur(10px)",
        borderBottom: "1px solid color-mix(in srgb, var(--color-border) 60%, transparent)",
      }}
    >
      <button
        type="button"
        className="tap"
        onClick={onAvatarClick}
        aria-label="Open menu"
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          padding: 0,
          border: "1px solid var(--color-border)",
          background: "var(--color-clay-soft)",
          color: "var(--color-terracotta-deep)",
          display: "grid",
          placeItems: "center",
          fontSize: 13.5,
          fontWeight: 600,
          flexShrink: 0,
          cursor: "pointer",
          letterSpacing: "0.01em",
        }}
      >
        {initial}
      </button>
      {/* Spacer — the page body's <PageHeader> carries the route title. */}
      <div style={{ flex: 1 }} />
      <OnlineToggle compact />
    </header>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Scrim                                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

function MobileScrim({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <div
      className="lg:hidden"
      role="presentation"
      onClick={onClick}
      aria-hidden={!open}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        background: "rgba(26, 23, 21, 0.42)",
        backdropFilter: "blur(2px)",
        opacity: open ? 1 : 0,
        pointerEvents: open ? "auto" : "none",
        transition: "opacity 220ms ease",
      }}
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Drawer                                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

function MobileDrawer({
  open,
  variant,
  firstName,
  email,
  schoolName,
  schoolSubtitle,
  onDismiss,
}: {
  open: boolean;
  variant: Variant;
  firstName?: string | null;
  email: string;
  schoolName: string;
  schoolSubtitle?: string;
  onDismiss: () => void;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const store = useMontessori();
  const draftCount =
    store.reports.filter((r) => r.status === "draft").length +
    store.reports.filter((r) => r.status === "review").length;
  const [signingOut, setSigningOut] = React.useState(false);

  const items = variant === "admin" ? ADMIN_NAV : TEACHER_NAV;

  const localPart = email.split("@")[0] ?? email;
  const displayName =
    firstName?.trim() ||
    (localPart.length ? localPart[0].toUpperCase() + localPart.slice(1) : email);
  const roleLabel = variant === "admin" ? "Admin" : "Lead guide";
  const initial = (firstName?.[0] || email[0] || "?").toUpperCase();

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      /* even if logout 500s, blow away local cache below */
    }
    try {
      clearSessionKeys();
      await clearDb();
    } catch {
      /* best-effort */
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      className="lg:hidden"
      role="dialog"
      aria-label="Navigation"
      aria-hidden={!open}
      style={{
        position: "fixed",
        top: 0,
        bottom: 0,
        left: 0,
        width: 304,
        maxWidth: "84%",
        zIndex: 80,
        background: "var(--color-surface)",
        boxShadow: "16px 0 40px rgba(43,38,34,0.18)",
        transform: open ? "translateX(0)" : "translateX(-105%)",
        transition: "transform 280ms cubic-bezier(0.32, 0.72, 0.24, 1)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/*
        Profile block — sits in a slightly warmer wash (--color-muted) than
        the drawer body (--color-surface), separated by a hairline. Mirrors the
        rhythm of the desktop sidebar's brand block + school card pairing.
      */}
      <div
        style={{
          padding: "20px 18px 16px",
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)",
          background: "var(--color-muted)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              background: "var(--color-clay-soft)",
              color: "var(--color-terracotta-deep)",
              display: "grid",
              placeItems: "center",
              fontSize: 16,
              fontWeight: 600,
              border: "1px solid var(--color-border)",
              flexShrink: 0,
              letterSpacing: "0.01em",
            }}
          >
            {initial}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14.5,
                fontWeight: 600,
                color: "var(--color-ink)",
                letterSpacing: "-0.005em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {displayName}
            </div>
            <div style={{ marginTop: 1, fontSize: 11.5, color: "var(--color-ink-muted)" }}>
              {roleLabel}
            </div>
          </div>
        </div>

        {/* School card — steps back onto the lighter surface so it nests inside the muted wash. */}
        <div
          style={{
            marginTop: 14,
            padding: "9px 11px",
            borderRadius: 10,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              background: "var(--color-terracotta-soft)",
              color: "var(--color-terracotta-deep)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <HouseSimple size={13} weight="regular" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--color-ink)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {schoolName}
            </div>
            {schoolSubtitle ? (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--color-ink-muted)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {schoolSubtitle}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav
        className="scroll-quiet"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 1,
        }}
      >
        <DrawerGroupLabel>Workspace</DrawerGroupLabel>
        {items.map((it) => {
          const isActive = pathname.startsWith(it.href);
          const showBadge = it.withDraftBadge && draftCount > 0;
          return (
            <Link
              key={it.href}
              href={it.href}
              onClick={onDismiss}
              className="tap"
              style={drawerItemStyle(isActive)}
            >
              <span style={{ width: 22, display: "grid", placeItems: "center" }}>{it.icon}</span>
              <span style={{ flex: 1 }}>{it.label}</span>
              {showBadge ? (
                <span
                  style={{
                    background: "var(--color-terracotta)",
                    color: "#fff",
                    fontSize: 10.5,
                    fontWeight: 600,
                    padding: "2px 7px",
                    borderRadius: 999,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {draftCount}
                </span>
              ) : null}
              {isActive ? <ActiveRail /> : null}
            </Link>
          );
        })}

        <DrawerGroupLabel>General</DrawerGroupLabel>
        <button type="button" onClick={onDismiss} className="tap" style={drawerItemStyle(false)}>
          <span style={{ width: 22, display: "grid", placeItems: "center" }}>
            <Settings size={18} strokeWidth={1.6} />
          </span>
          <span style={{ flex: 1, textAlign: "left" }}>Settings</span>
        </button>
        <button type="button" onClick={onDismiss} className="tap" style={drawerItemStyle(false)}>
          <span style={{ width: 22, display: "grid", placeItems: "center" }}>
            <HelpCircle size={18} strokeWidth={1.6} />
          </span>
          <span style={{ flex: 1, textAlign: "left" }}>Help &amp; feedback</span>
        </button>
      </nav>

      {/* Foot */}
      <div
        style={{
          padding: "10px 8px",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)",
          borderTop: "1px solid var(--color-border)",
          background: "var(--color-surface)",
        }}
      >
        <button
          type="button"
          className="tap"
          onClick={handleSignOut}
          disabled={signingOut}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 14px",
            width: "100%",
            borderRadius: 12,
            background: "transparent",
            color: "var(--color-terracotta-deep)",
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
            opacity: signingOut ? 0.6 : 1,
          }}
        >
          <LogOut size={18} strokeWidth={1.6} />
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </aside>
  );
}

function DrawerGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "14px 14px 6px",
        fontSize: 10.5,
        fontWeight: 600,
        color: "var(--color-ink-muted)",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

function drawerItemStyle(active: boolean): React.CSSProperties {
  return {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 12,
    fontSize: 14.5,
    fontWeight: active ? 600 : 500,
    color: active ? "var(--color-terracotta-deep)" : "var(--color-ink-secondary)",
    background: active ? "var(--color-terracotta-soft)" : "transparent",
    border: 0,
    textDecoration: "none",
    width: "100%",
    cursor: "pointer",
  };
}

function ActiveRail() {
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        left: 4,
        top: "50%",
        transform: "translateY(-50%)",
        width: 3,
        height: 18,
        borderRadius: 999,
        background: "var(--color-terracotta)",
      }}
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Chat FAB + bottom sheet                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

function MobileChatFab({ hidden, onClick }: { hidden: boolean; onClick: () => void }) {
  const store = useMontessori();
  // Wrapper is `lg:hidden` so above `lg` Tailwind's `display:none` reliably
  // beats the button's inline `display:grid` and the FAB never coexists with
  // the desktop ChatDock pill.
  return (
    <div className="lg:hidden">
      <button
        type="button"
        className="tap"
        onClick={onClick}
        aria-label="Ask Mitable"
        aria-hidden={hidden}
        style={{
          position: "fixed",
          right: 16,
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
          width: 56,
          height: 56,
          borderRadius: 999,
          background: "var(--color-terracotta)",
          color: "#fff",
          display: "grid",
          placeItems: "center",
          boxShadow: "0 8px 18px rgba(196,106,79,0.35)",
          border: "3px solid var(--color-surface)",
          zIndex: 30,
          cursor: "pointer",
          opacity: hidden ? 0 : 1,
          pointerEvents: hidden ? "none" : "auto",
          transform: hidden ? "translateY(8px) scale(0.92)" : "translateY(0) scale(1)",
          transition: "opacity 200ms ease, transform 200ms ease",
        }}
      >
        <MessageSquare size={22} strokeWidth={1.8} />
        {store.pendingObs > 0 ? (
          <span
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              width: 18,
              height: 18,
              borderRadius: 999,
              background: "var(--color-ink)",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              display: "grid",
              placeItems: "center",
              border: "2px solid var(--color-surface)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {store.pendingObs}
          </span>
        ) : null}
      </button>
    </div>
  );
}

function MobileChatSheet({
  open,
  classroomId,
  classroomName,
  schoolId,
  userId,
  onClose,
}: {
  open: boolean;
  classroomId: string | null;
  classroomName: string;
  schoolId: string;
  userId: string;
  onClose: () => void;
}) {
  const [threadId] = React.useState(() => `thread-${crypto.randomUUID()}`);

  // Outer wrapper carries `lg:hidden` so above `lg` the sheet is fully removed
  // from layout regardless of the inner inline `display: flex`.
  return (
    <div className="lg:hidden">
      <div
        role="dialog"
        aria-label="Ask Mitable"
        aria-hidden={!open}
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          height: "85vh",
          zIndex: 80,
          background: "var(--color-canvas)",
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          boxShadow: "0 -16px 40px rgba(43,38,34,0.18)",
          transform: open ? "translateY(0)" : "translateY(105%)",
          transition: "transform 320ms cubic-bezier(0.32, 0.72, 0.24, 1)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          aria-hidden
          style={{
            width: 40,
            height: 4,
            borderRadius: 999,
            background: "var(--color-border-strong)",
            opacity: 0.6,
            margin: "8px auto 0",
          }}
        />
        <div
          style={{
            padding: "12px 16px 10px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            borderBottom: "1px solid color-mix(in srgb, var(--color-border) 60%, transparent)",
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 999,
              background: "var(--color-terracotta-soft)",
              color: "var(--color-terracotta-deep)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <Sparkles size={16} strokeWidth={1.6} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.005em" }}>
              Ask Mitable
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: "var(--color-ink-muted)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              Capture &amp; review · {classroomName}
            </div>
          </div>
          <button
            type="button"
            className="tap"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              border: 0,
              background: "transparent",
              color: "var(--color-ink-secondary)",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
            }}
          >
            <X size={18} strokeWidth={1.6} />
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {classroomId ? (
            // Only mount the live thread once it's been opened — avoids paying the
            // network/render cost on every page load when the sheet is closed.
            open ? (
              <ChatThread
                threadId={threadId}
                classroomId={classroomId}
                schoolId={schoolId}
                userId={userId}
              />
            ) : null
          ) : (
            <div
              style={{
                flex: 1,
                display: "grid",
                placeItems: "center",
                padding: 24,
                textAlign: "center",
                fontSize: 13,
                color: "var(--color-ink-muted)",
                lineHeight: 1.5,
              }}
            >
              You aren&apos;t assigned to a classroom yet. Ask an admin to add you to one before
              capturing observations.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
