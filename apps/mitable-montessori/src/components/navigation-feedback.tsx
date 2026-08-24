"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NAVIGATION_START_EVENT } from "@/lib/navigation-feedback";

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
    const startNavigation = () => setIsNavigating(true);
    const handleClick = (event: MouseEvent) => {
      if (!isInternalNavigation(event)) return;

      startNavigation();
    };

    document.addEventListener("click", handleClick, true);
    window.addEventListener(NAVIGATION_START_EVENT, startNavigation);
    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener(NAVIGATION_START_EVENT, startNavigation);
    };
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
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[100]">
        <div className="navigation-progress h-1 w-full bg-terracotta" />
      </div>
      {showMessage ? (
        <div
          aria-live="polite"
          className="fixed inset-0 z-[99] flex items-center justify-center bg-canvas/35 px-5 backdrop-blur-sm"
          role="status"
        >
          <div className="rounded-full border border-border-strong bg-surface px-8 py-4 text-base font-semibold text-ink shadow-lg sm:px-10 sm:text-lg">
            Page loading…
          </div>
        </div>
      ) : null}
    </>
  );
}
