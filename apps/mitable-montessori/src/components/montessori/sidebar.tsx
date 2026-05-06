"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Book, Building2, ChevronRight, Users } from "lucide-react";
import { CalendarBlank, HouseSimple, PencilSimple, SquaresFour } from "@phosphor-icons/react";
import { CHILDREN } from "./data";
import { OnlineToggle } from "./online-toggle";
import { useMontessori } from "./store";

type NavItem = {
  href: string;
  label: string;
  renderIcon: () => React.ReactNode;
  withDraftBadge?: boolean;
};

const NAV_ICON_SIZE = 18;
const phosphor = { size: NAV_ICON_SIZE, weight: "regular" as const };
const lucide = { size: 17, strokeWidth: 1.5 };

const NAV: NavItem[] = [
  { href: "/app/today", label: "Today", renderIcon: () => <HouseSimple {...phosphor} /> },
  { href: "/app/roster", label: "Roster", renderIcon: () => <Users {...lucide} /> },
  { href: "/app/curriculum", label: "Curriculum", renderIcon: () => <Book {...lucide} /> },
  { href: "/app/progress", label: "Progress", renderIcon: () => <SquaresFour {...phosphor} /> },
  {
    href: "/app/attendance",
    label: "Attendance",
    renderIcon: () => <CalendarBlank {...phosphor} />,
  },
  {
    href: "/app/reports",
    label: "Reports",
    renderIcon: () => <PencilSimple {...phosphor} />,
    withDraftBadge: true,
  },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin/today", label: "Today", renderIcon: () => <HouseSimple {...phosphor} /> },
  { href: "/admin/classrooms", label: "Classrooms", renderIcon: () => <Building2 {...lucide} /> },
  { href: "/admin/curriculum", label: "Curriculum", renderIcon: () => <Book {...lucide} /> },
  { href: "/admin/teachers", label: "Teachers", renderIcon: () => <Users {...lucide} /> },
  {
    href: "/admin/reports",
    label: "Reports",
    renderIcon: () => <PencilSimple {...phosphor} />,
    withDraftBadge: true,
  },
];

export function MontessoriSidebar({
  variant = "teacher",
  classroomName,
  contextSubtitle,
  userMenuSlot,
}: {
  variant?: "teacher" | "admin";
  classroomName: string;
  /** Replaces the default “{n} children” line under the workspace title */
  contextSubtitle?: string;
  /**
   * Footer slot — renders directly above the bottom of the sidebar. Layouts
   * pass a `<UserMenu variant="row" … />` here; the menu is responsible for
   * its own identity card + popup.
   */
  userMenuSlot?: React.ReactNode;
}) {
  const pathname = usePathname();
  const store = useMontessori();
  const draftCount =
    store.reports.filter((r) => r.status === "draft").length +
    store.reports.filter((r) => r.status === "review").length;
  const navItems = variant === "admin" ? ADMIN_NAV : NAV;
  const subtitleLine =
    contextSubtitle ??
    (variant === "admin" ? "People, curriculum, and reports" : `${CHILDREN.length} children`);

  return (
    <aside
      className="hidden lg:flex"
      style={{
        width: 232,
        background: "var(--color-muted)",
        borderRight: "1px solid var(--color-border)",
        flexDirection: "column",
        padding: "20px 14px",
        flexShrink: 0,
        position: "sticky",
        top: 0,
        height: "100vh",
        overflow: "visible",
      }}
    >
      <div
        style={{
          padding: "0 8px 18px",
          borderBottom: "1px solid var(--color-border)",
          marginBottom: 14,
        }}
      >
        <div
          className="font-display"
          style={{
            fontSize: 28,
            color: "var(--color-ink)",
            lineHeight: 1,
            letterSpacing: "-0.01em",
          }}
        >
          Mitable
        </div>
        <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginTop: 2 }}>
          Montessori
        </div>
      </div>
      <div
        style={{
          padding: "8px 10px",
          background: "var(--color-surface)",
          borderRadius: 10,
          border: "1px solid var(--color-border)",
          marginBottom: 14,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            background: "var(--color-terracotta-soft)",
            color: "var(--color-terracotta-deep)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {classroomName.charAt(0).toUpperCase()}
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
            {classroomName}
          </div>
          <div style={{ fontSize: 11, color: "var(--color-ink-muted)" }}>{subtitleLine}</div>
        </div>
        <ChevronRight size={14} strokeWidth={1.5} />
      </div>
      <nav>
        {navItems.map((n) => {
          const isActive = pathname?.startsWith(n.href) ?? false;
          const showBadge = n.withDraftBadge && draftCount > 0;
          return (
            <Link
              key={n.href}
              href={n.href}
              className="tap"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 10px",
                borderRadius: 9,
                marginBottom: 2,
                background: isActive ? "var(--color-surface)" : "transparent",
                color: isActive ? "var(--color-ink)" : "var(--color-ink-secondary)",
                border: isActive ? "1px solid var(--color-border)" : "1px solid transparent",
                fontSize: 13,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              {n.renderIcon()}
              <span style={{ flex: 1 }}>{n.label}</span>
              {showBadge ? (
                <span
                  style={{
                    fontSize: 10,
                    background: "var(--color-terracotta)",
                    color: "var(--color-surface)",
                    borderRadius: 999,
                    padding: "1px 6px",
                    fontWeight: 600,
                  }}
                >
                  {draftCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div style={{ flex: 1 }} />
      <div style={{ marginBottom: 10, display: "flex", justifyContent: "flex-start" }}>
        <OnlineToggle />
      </div>
      {userMenuSlot}
    </aside>
  );
}
