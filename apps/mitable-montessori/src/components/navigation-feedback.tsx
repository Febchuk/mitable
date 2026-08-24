"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function isInternalNavigation(event: MouseEvent) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false;
  }

  const target = event.target;
  if (!(target instanceof Element)) return false;

  const link = target.closest<HTMLAnchorElement>("a[href]");
  if (!link || link.target === "_blank" || link.hasAttribute("download")) return false;

  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin) return false;

  return url.pathname !== window.location.pathname || url.search !== window.location.search;
}

/** Shows an immediate, consistent signal while an in-app link is opening. */
export function NavigationFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const route = `${pathname}?${searchParams.toString()}`;
  const [isNavigating, setIsNavigating] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const previousRouteRef = useRef(route);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!isInternalNavigation(event)) return;

      setIsNavigating(true);
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  useEffect(() => {
    if (previousRouteRef.current === route) return;

    previousRouteRef.current = route;
    setIsNavigating(false);
  }, [route]);

  useEffect(() => {
    if (!isNavigating) {
      setShowMessage(false);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      return;
    }

    const messageTimer = window.setTimeout(() => setShowMessage(true), 180);
    timeoutRef.current = window.setTimeout(() => setIsNavigating(false), 12_000);

    return () => {
      window.clearTimeout(messageTimer);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, [isNavigating]);

  if (!isNavigating) return null;

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-[100]">
      <div className="navigation-progress h-1 w-full bg-terracotta" />
      {showMessage ? (
        <div
          className="absolute right-4 top-4 flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 text-xs font-medium text-ink-secondary shadow-sm"
          role="status"
        >
          <span
            className="h-3 w-3 rounded-full border-2 border-clay-soft border-t-terracotta"
            style={{ animation: "spin 0.8s linear infinite" }}
          />
          Loading page…
        </div>
      ) : null}
    </div>
  );
}
