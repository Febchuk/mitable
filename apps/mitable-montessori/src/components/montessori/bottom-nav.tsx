"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Book, Building2, MessageSquare, Users } from "lucide-react";
import { HouseSimple, PencilSimple, SquaresFour } from "@phosphor-icons/react";
import { useMontessori } from "./store";

type Tab = {
  id: string;
  label: string;
  href?: string;
  renderIcon: (size: number) => React.ReactNode;
  primary?: boolean;
};

const TABS: Tab[] = [
  {
    id: "today",
    label: "Today",
    href: "/app/today",
    renderIcon: (size) => <HouseSimple size={size} weight="regular" />,
  },
  {
    id: "roster",
    label: "Roster",
    href: "/app/roster",
    renderIcon: (size) => <Users size={size} strokeWidth={1.5} />,
  },
  {
    id: "chat",
    label: "Chat",
    primary: true,
    renderIcon: (size) => <MessageSquare size={size} strokeWidth={1.5} />,
  },
  {
    id: "progress",
    label: "Progress",
    href: "/app/progress",
    renderIcon: (size) => <SquaresFour size={size} weight="regular" />,
  },
  {
    id: "reports",
    label: "Reports",
    href: "/app/reports",
    renderIcon: (size) => <PencilSimple size={size} weight="regular" />,
  },
];

const ADMIN_TABS: Tab[] = [
  {
    id: "today",
    label: "Today",
    href: "/app/today",
    renderIcon: (size) => <HouseSimple size={size} weight="regular" />,
  },
  {
    id: "classrooms",
    label: "Classrooms",
    href: "/admin/classrooms",
    renderIcon: (size) => <Building2 size={size} strokeWidth={1.5} />,
  },
  {
    id: "curriculum",
    label: "Curriculum",
    href: "/admin/curriculum",
    renderIcon: (size) => <Book size={size} strokeWidth={1.5} />,
  },
  {
    id: "teachers",
    label: "Teachers",
    href: "/admin/teachers",
    renderIcon: (size) => <Users size={size} strokeWidth={1.5} />,
  },
  {
    id: "reports",
    label: "Reports",
    href: "/admin/reports",
    renderIcon: (size) => <PencilSimple size={size} weight="regular" />,
  },
];

export function MontessoriBottomNav({ variant = "teacher" }: { variant?: "teacher" | "admin" }) {
  const pathname = usePathname();
  const store = useMontessori();
  const draftCount = store.reports.filter((r) => r.status === "draft").length;
  const reviewCount = store.reports.filter((r) => r.status === "review").length;
  const reportBadgeCount = draftCount + reviewCount;
  const isChatActive = pathname?.startsWith("/app/chat");

  if (variant === "admin") {
    return (
      <nav
        className="grid lg:hidden"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          paddingTop: 8,
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
          background: "var(--color-surface)",
          borderTop: "1px solid var(--color-border)",
          gridTemplateColumns: "repeat(5, 1fr)",
          alignItems: "center",
          gap: 4,
          zIndex: 30,
        }}
      >
        {ADMIN_TABS.map((t) => {
          const isActive = pathname?.startsWith(t.href ?? "");
          const showBadge = t.id === "reports" && reportBadgeCount > 0;
          return (
            <Link
              key={t.id}
              href={t.href!}
              className="tap"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                color: isActive ? "var(--color-ink)" : "var(--color-ink-muted)",
                position: "relative",
                padding: "4px 0",
                textDecoration: "none",
              }}
            >
              {t.renderIcon(22)}
              <span style={{ fontSize: 11, fontWeight: isActive ? 600 : 500 }}>{t.label}</span>
              {showBadge && (
                <div
                  style={{
                    position: "absolute",
                    top: -2,
                    right: "calc(50% - 18px)",
                    background: "var(--color-terracotta)",
                    color: "var(--color-surface)",
                    fontSize: 10,
                    fontWeight: 600,
                    width: 16,
                    height: 16,
                    borderRadius: 999,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {reportBadgeCount}
                </div>
              )}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      className="grid lg:hidden"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        paddingTop: 8,
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
        background: "var(--color-surface)",
        borderTop: "1px solid var(--color-border)",
        gridTemplateColumns: "repeat(5, 1fr)",
        alignItems: "center",
        gap: 4,
        zIndex: 30,
      }}
    >
      {TABS.map((t) => {
        const isActive = t.id === "chat" ? isChatActive : pathname?.startsWith(t.href ?? "");

        if (t.primary) {
          return (
            <Link
              key={t.id}
              href="/app/chat"
              className="tap"
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                position: "relative",
                background: "transparent",
                border: 0,
                padding: 0,
                color: "inherit",
                textDecoration: "none",
              }}
            >
              <div style={{ position: "relative", top: -16 }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 999,
                    background: "var(--color-terracotta)",
                    color: "var(--color-surface)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 8px 18px rgba(196,106,79,0.35)",
                    border: "4px solid var(--color-surface)",
                    position: "relative",
                  }}
                >
                  {t.renderIcon(22)}
                  {store.pendingObs > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        top: -4,
                        right: -4,
                        background: "var(--color-ink)",
                        color: "var(--color-surface)",
                        fontSize: 10,
                        fontWeight: 700,
                        width: 18,
                        height: 18,
                        borderRadius: 999,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "2px solid var(--color-surface)",
                      }}
                    >
                      {store.pendingObs}
                    </div>
                  )}
                </div>
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: isActive ? "var(--color-terracotta)" : "var(--color-ink-muted)",
                  position: "relative",
                  top: -10,
                }}
              >
                {t.label}
              </div>
            </Link>
          );
        }

        const showBadge = t.id === "reports" && draftCount > 0;
        return (
          <Link
            key={t.id}
            href={t.href!}
            className="tap"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              color: isActive ? "var(--color-ink)" : "var(--color-ink-muted)",
              position: "relative",
              padding: "4px 0",
              textDecoration: "none",
            }}
          >
            {t.renderIcon(22)}
            <span style={{ fontSize: 11, fontWeight: isActive ? 600 : 500 }}>{t.label}</span>
            {showBadge && (
              <div
                style={{
                  position: "absolute",
                  top: -2,
                  right: "calc(50% - 18px)",
                  background: "var(--color-terracotta)",
                  color: "var(--color-surface)",
                  fontSize: 10,
                  fontWeight: 600,
                  width: 16,
                  height: 16,
                  borderRadius: 999,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {draftCount}
              </div>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
