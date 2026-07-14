/**
 * Client-side reveal preference for admins.
 * Default = filtered (hidden). Stored in localStorage + a cookie so SSR
 * (admin Today) and fetch headers stay in sync on this device.
 */

import {
  REVEAL_HIDDEN_COOKIE,
  REVEAL_HIDDEN_HEADER,
  REVEAL_HIDDEN_STORAGE_KEY,
} from "@/lib/visibility/ui-hidden-shared";

export function getRevealHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(REVEAL_HIDDEN_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setRevealHidden(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (on) {
      window.localStorage.setItem(REVEAL_HIDDEN_STORAGE_KEY, "1");
    } else {
      window.localStorage.removeItem(REVEAL_HIDDEN_STORAGE_KEY);
    }
  } catch {
    /* ignore quota / private mode */
  }
  const maxAge = on ? 60 * 60 * 24 * 365 : 0;
  const value = on ? "1" : "";
  document.cookie = `${REVEAL_HIDDEN_COOKIE}=${value}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/** Attach reveal header when the admin has opted in on this device. */
export function revealHiddenHeaders(): HeadersInit {
  if (!getRevealHidden()) return {};
  return { [REVEAL_HIDDEN_HEADER]: "1" };
}

/** fetch() wrapper for admin list APIs that respect the reveal toggle. */
export async function adminFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const reveal = revealHiddenHeaders();
  for (const [k, v] of Object.entries(reveal)) {
    headers.set(k, v);
  }
  return fetch(input, { ...init, headers });
}
