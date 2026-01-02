import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  subscriptions,
  usageLimits,
  organizations,
  type Subscription,
  type UsageLimits,
  type SubscriptionTier,
} from "../db/schema/index.js";
import { config } from "../config.js";

/**
 * Subscription Service
 *
 * Manages organization subscriptions, tier access, and feature flags.
 * For beta: All new orgs get 'team' tier. Internal orgs bypass all limits.
 */
class SubscriptionService {
  /**
   * Get organization subscription with tier limits
   */
  async getSubscription(
    organizationId: string
  ): Promise<(Subscription & { limits: UsageLimits | null }) | null> {
    const result = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, organizationId))
      .limit(1);

    if (!result[0]) {
      return null;
    }

    const subscription = result[0];
    const limits = await this.getTierLimits(subscription.tier as SubscriptionTier);

    return { ...subscription, limits };
  }

  /**
   * Create subscription for new organization
   * Default tier is 'team' during beta period
   */
  async createSubscription(
    organizationId: string,
    tier: SubscriptionTier = config.billing.defaultTier
  ): Promise<Subscription> {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1); // First of month
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59); // Last of month

    const [subscription] = await db
      .insert(subscriptions)
      .values({
        organizationId,
        tier,
        status: "active",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      })
      .returning();

    return subscription;
  }

  /**
   * Check if organization has access to a specific feature
   */
  async hasFeature(organizationId: string, feature: string): Promise<boolean> {
    // Internal orgs have all features
    if (await this.isInternalOrg(organizationId)) {
      return true;
    }

    const subscription = await this.getSubscription(organizationId);
    if (!subscription) {
      return false;
    }

    const tierFeatures =
      config.billing.tierFeatures[subscription.tier as keyof typeof config.billing.tierFeatures] ||
      [];
    return tierFeatures.includes(feature) || tierFeatures.includes("all");
  }

  /**
   * Check if organization is internal (test account)
   * Internal orgs bypass all quota limits
   */
  async isInternalOrg(organizationId: string): Promise<boolean> {
    const result = await db
      .select({
        isInternal: organizations.isInternal,
        domain: organizations.domain,
      })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!result[0]) {
      return false;
    }

    // Check explicit is_internal flag
    if (result[0].isInternal) {
      return true;
    }

    // Fallback: check if domain is in internal domains list
    if (result[0].domain && config.billing.internalDomains.includes(result[0].domain)) {
      return true;
    }

    return false;
  }

  /**
   * Get tier limits configuration
   */
  async getTierLimits(tier: SubscriptionTier): Promise<UsageLimits | null> {
    const result = await db.select().from(usageLimits).where(eq(usageLimits.tier, tier)).limit(1);

    return result[0] || null;
  }

  /**
   * Update organization tier
   */
  async updateTier(
    organizationId: string,
    newTier: SubscriptionTier
  ): Promise<Subscription | null> {
    const [updated] = await db
      .update(subscriptions)
      .set({
        tier: newTier,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.organizationId, organizationId))
      .returning();

    return updated || null;
  }

  /**
   * Get all tier definitions
   */
  async getAllTierLimits(): Promise<UsageLimits[]> {
    return await db.select().from(usageLimits);
  }
}

// Singleton instance
export const subscriptionService = new SubscriptionService();
