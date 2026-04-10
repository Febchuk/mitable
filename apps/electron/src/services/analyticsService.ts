import { PostHog } from "posthog-node";

let client: PostHog | null = null;
const POSTHOG_KEY = "phc_tikntyG4XRScqlQpA1vFzeai3rFBKC3cVVCUkfyaQ6Q";
const POSTHOG_HOST = "https://us.i.posthog.com";

export function initAnalytics() {
  if (client) return;

  client = new PostHog(POSTHOG_KEY, {
    host: POSTHOG_HOST,
    flushAt: 20,
    flushInterval: 10000,
  });
}

export function trackMainEvent(
  userId: string,
  event: string,
  properties?: Record<string, unknown>
) {
  if (!client || !userId) return;

  client.capture({
    distinctId: userId,
    event,
    properties: {
      ...properties,
      service: "mitable-electron",
      platform: process.platform,
    },
  });
}

export function identifyMainUser(
  userId: string,
  properties: Record<string, unknown>
) {
  if (!client) return;

  client.identify({
    distinctId: userId,
    properties,
  });
}

export async function shutdownAnalytics() {
  if (client) {
    await client.shutdown();
    client = null;
  }
}
