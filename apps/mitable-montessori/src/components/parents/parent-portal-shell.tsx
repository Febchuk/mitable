"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BookOpen, CalendarDays, ChartNoAxesCombined, FileText, Home } from "lucide-react";
import { UserMenu } from "@/components/app/UserMenu";
import type { ParentChild } from "@/lib/parents/portal";

const NAV_ITEMS = [
  { href: "/parents/overview", label: "Overview", icon: Home },
  { href: "/parents/attendance", label: "Attendance", icon: CalendarDays },
  { href: "/parents/progress", label: "Progress", icon: ChartNoAxesCombined },
  { href: "/parents/reports", label: "Reports", icon: FileText },
];

export function ParentPortalShell({
  children,
  firstName,
  email,
  linkedChildren,
}: {
  children: React.ReactNode;
  firstName: string;
  email: string;
  linkedChildren: ParentChild[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedId = searchParams.get("child") || linkedChildren[0]?.id || "";

  const hrefFor = (path: string, childId = selectedId) =>
    childId ? `${path}?child=${encodeURIComponent(childId)}` : path;

  const switchChild = (childId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("child", childId);
    const section = NAV_ITEMS.some((item) => pathname.startsWith(item.href))
      ? pathname
      : "/parents/overview";
    router.push(`${section}?${params.toString()}`);
  };

  const selector =
    linkedChildren.length > 0 ? (
      <label className="flex items-center gap-2 text-sm font-medium text-ink-secondary">
        <BookOpen className="h-4 w-4 text-ink-muted" aria-hidden />
        <span className="sr-only">Select child</span>
        <select
          aria-label="Select child"
          value={selectedId}
          onChange={(event) => switchChild(event.target.value)}
          className="max-w-48 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-ink outline-none focus:border-terracotta"
        >
          {linkedChildren.map((child) => (
            <option key={child.id} value={child.id}>
              {child.name}
            </option>
          ))}
        </select>
      </label>
    ) : null;

  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col border-r border-border bg-muted px-[14px] py-5 lg:flex">
        <Link
          href={hrefFor("/parents/overview")}
          className="mb-4 border-b border-border px-2 pb-[18px] no-underline"
        >
          <div className="font-display text-[28px] leading-none text-ink">Mitable</div>
          <div className="label-cap mt-0.5 text-ink-muted">Parents</div>
        </Link>
        <nav>
          {NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={hrefFor(item.href)}
                className={`mb-0.5 flex items-center gap-2.5 rounded-[9px] border px-2.5 py-2.5 text-[13px] font-medium no-underline ${
                  active
                    ? "border-border bg-surface text-ink"
                    : "border-transparent text-ink-secondary hover:bg-surface/70"
                }`}
              >
                <Icon className="h-[17px] w-[17px]" strokeWidth={1.6} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex-1" />
        <UserMenu
          email={email}
          firstName={firstName}
          roleLabel="Parent"
          variant="row"
          direction="up"
          align="left"
          signOutHref="/parents/login"
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex min-h-[65px] items-center justify-between border-b border-border bg-canvas/85 px-4 backdrop-blur lg:justify-end lg:px-8">
          <Link
            href={hrefFor("/parents/overview")}
            className="font-display text-xl text-ink no-underline lg:hidden"
          >
            Mitable
          </Link>
          <div className="flex items-center gap-3">
            {selector}
            <div className="lg:hidden">
              <UserMenu email={email} firstName={firstName} signOutHref="/parents/login" />
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 pb-24 sm:px-7 lg:px-8 lg:py-8 lg:pb-8">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-surface px-1 py-2 lg:hidden">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={hrefFor(item.href)}
              className={`flex flex-col items-center gap-1 rounded-md py-1 text-[10px] font-medium no-underline ${
                active ? "text-terracotta-deep" : "text-ink-muted"
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={1.7} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
