import { PostHog } from "posthog-node";
import { logger } from "./logger";

let client: PostHog | null = null;

export function initAnalytics() {
  if (!process.env.POSTHOG_API_KEY) {
    logger.warn("PostHog API key not configured, analytics disabled");
    return;
  }

  client = new PostHog(process.env.POSTHOG_API_KEY, {
    host: process.env.POSTHOG_HOST || "https://app.posthog.com",
    flushAt: 20,
    flushInterval: 10000,
  });

  logger.info("PostHog analytics initialized");
}

export const analytics = {
  /**
   * Track an event for a user
   */
  track(userId: string, event: string, properties?: Record<string, unknown>) {
    if (!client) return;

    client.capture({
      distinctId: userId,
      event,
      properties: {
        ...properties,
        environment: process.env.NODE_ENV || "development",
        service: "mitable-backend",
      },
    });
  },

  /**
   * Identify a user with properties
   */
  identify(userId: string, properties: Record<string, unknown>) {
    if (!client) return;

    client.identify({
      distinctId: userId,
      properties,
    });
  },

  /**
   * Shutdown gracefully - flush pending events
   */
  async shutdown() {
    if (client) {
      await client.shutdown();
      logger.info("PostHog analytics shutdown complete");
    }
  },
};
