import { PostHog } from "posthog-node";

let client: PostHog | null = null;

export function initAnalytics() {
  if (client) return;

  const key = process.env.POSTHOG_API_KEY;
  if (!key) return;

  client = new PostHog(key, {
    host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
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

export function identifyMainUser(userId: string, properties: Record<string, unknown>) {
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
