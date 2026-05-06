"use client";

import * as React from "react";

function subscribeLocale(cb: () => void) {
  window.addEventListener("languagechange", cb);
  return () => window.removeEventListener("languagechange", cb);
}

function getClientLocale(): string {
  return navigator.language;
}

/** Matches SSR / hydration first paint (see React useSyncExternalStore). */
function getServerLocale(): string {
  return "en-US";
}

/**
 * Browser UI locale for `Intl` / `toLocaleDateString`. After hydration it follows
 * `navigator.language` (and updates on `languagechange`). Server and the first
 * hydrated paint use `en-US` so markup matches and avoids hydration mismatches.
 */
export function useUiLocale(): string {
  return React.useSyncExternalStore(subscribeLocale, getClientLocale, getServerLocale);
}
