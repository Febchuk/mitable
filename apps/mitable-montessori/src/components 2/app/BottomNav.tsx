"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck2, Home, Sprout } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/app/today", label: "Today", icon: Home },
  { href: "/app/attendance", label: "Attendance", icon: CalendarCheck2 },
  { href: "/app/progress", label: "Progress", icon: Sprout },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-ink/10 bg-canvas/95 px-3 py-2 backdrop-blur sm:static sm:flex-col sm:items-stretch sm:justify-start sm:gap-1 sm:border-r sm:border-t-0 sm:bg-canvas/60 sm:py-6">
      {ITEMS.map((item) => {
        const active = pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 rounded-md px-3 py-2 text-xs font-medium text-ink/60 hover:text-ink sm:flex-none sm:flex-row sm:gap-3 sm:text-sm",
              active && "text-terracotta sm:bg-terracotta/10"
            )}
          >
            <Icon className="h-5 w-5" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
