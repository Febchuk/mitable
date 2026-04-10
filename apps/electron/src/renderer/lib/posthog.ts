import posthog from "posthog-js";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string) || "https://us.i.posthog.com";

let initialized = false;

export function initPostHog() {
  if (initialized || !POSTHOG_KEY) return;
  initialized = true;

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false, // HashRouter needs manual tracking
    capture_pageleave: true,
    persistence: "localStorage",
    autocapture: false, // Electron windows don't benefit from autocapture
  });
}

export function identifyUser(user: {
  id: string;
  email?: string;
  organizationId?: string;
  role?: string;
  isManager?: boolean;
}) {
  if (!POSTHOG_KEY) return;
  posthog.identify(user.id, {
    email: user.email,
    organizationId: user.organizationId,
    role: user.role,
    isManager: user.isManager,
  });
}

export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (!POSTHOG_KEY) return;
  posthog.capture(event, properties);
}

export function resetUser() {
  if (!POSTHOG_KEY) return;
  posthog.reset();
}
