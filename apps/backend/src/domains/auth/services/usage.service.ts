import { eq, and, sql, desc } from "drizzle-orm";
import { db } from "../../../db/client.js";
import {
  usageTracking,
  subscriptions,
  usageLimits,
  type UsageTracking,
  type QuotaStatus,
  type SubscriptionTier,
} from "../../../db/schema/index.js";
import { subscriptionService } from "./subscription.service.js";

/**
 * Usage Service
 *
 * Tracks organization usage metrics and provides quota status.
 * Soft enforcement: tracks usage but doesn't block requests.
 */
class UsageService {
  /**
   * Increment AI query counter for organization
   * Called after successful AI responses
   */
  async incrementAiQueries(organizationId: string): Promise<void> {
    const currentPeriod = await this.ensureCurrentPeriod(organizationId);

    await db
      .update(usageTracking)
      .set({
        aiQueries: sql`${usageTracking.aiQueries} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(usageTracking.id, currentPeriod.id));
  }

  /**
   * Increment document upload counter
   */
  async incrementDocuments(organizationId: string, count: number = 1): Promise<void> {
    const currentPeriod = await this.ensureCurrentPeriod(organizationId);

    await db
      .update(usageTracking)
      .set({
        documentsUploaded: sql`${usageTracking.documentsUploaded} + ${count}`,
        updatedAt: new Date(),
      })
      .where(eq(usageTracking.id, currentPeriod.id));
  }

  /**
   * Update storage usage
   */
  async updateStorageUsage(organizationId: string, bytes: number): Promise<void> {
    const currentPeriod = await this.ensureCurrentPeriod(organizationId);

    await db
      .update(usageTracking)
      .set({
        storageBytesUsed: bytes,
        updatedAt: new Date(),
      })
      .where(eq(usageTracking.id, currentPeriod.id));
  }

  /**
   * Increment integration sync counter
   */
  async incrementIntegrationSyncs(organizationId: string): Promise<void> {
    const currentPeriod = await this.ensureCurrentPeriod(organizationId);

    await db
      .update(usageTracking)
      .set({
        integrationSyncs: sql`${usageTracking.integrationSyncs} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(usageTracking.id, currentPeriod.id));
  }

  /**
   * Get current period usage for organization
   */
  async getCurrentUsage(organizationId: string): Promise<UsageTracking> {
    return await this.ensureCurrentPeriod(organizationId);
  }

  /**
   * Get quota status with usage vs limits comparison
   */
  async getQuotaStatus(organizationId: string): Promise<QuotaStatus> {
    const isInternal = await subscriptionService.isInternalOrg(organizationId);

    // Get subscription
    const subscriptionResult = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, organizationId))
      .limit(1);

    const subscription = subscriptionResult[0];
    const tier = (subscription?.tier || "free") as SubscriptionTier;

    // Get limits
    const limitsResult = await db
      .select()
      .from(usageLimits)
      .where(eq(usageLimits.tier, tier))
      .limit(1);
    const limits = limitsResult[0];

    // Get current usage
    const usage = await this.ensureCurrentPeriod(organizationId);

    // Helper to calculate percent used (handles unlimited case)
    const calcPercent = (used: number, limit: number | null): number => {
      if (limit === null) return 0; // Unlimited
      if (limit === 0) return 100;
      return Math.round((used / limit) * 100);
    };

    // Helper to calculate remaining (handles unlimited case)
    const calcRemaining = (used: number, limit: number | null): number | null => {
      if (limit === null) return null; // Unlimited
      return Math.max(0, limit - used);
    };

    return {
      tier,
      isInternal,
      aiQueries: {
        used: usage.aiQueries || 0,
        limit: limits?.monthlyAiQueries ?? null,
        remaining: calcRemaining(usage.aiQueries || 0, limits?.monthlyAiQueries ?? null),
        percentUsed: calcPercent(usage.aiQueries || 0, limits?.monthlyAiQueries ?? null),
      },
      documents: {
        used: usage.documentsUploaded || 0,
        limit: limits?.maxDocuments ?? null,
        remaining: calcRemaining(usage.documentsUploaded || 0, limits?.maxDocuments ?? null),
        percentUsed: calcPercent(usage.documentsUploaded || 0, limits?.maxDocuments ?? null),
      },
      storage: {
        usedBytes: Number(usage.storageBytesUsed) || 0,
        limitBytes: limits?.maxStorageBytes ?? null,
        remainingBytes: calcRemaining(
          Number(usage.storageBytesUsed) || 0,
          limits?.maxStorageBytes ?? null
        ),
        percentUsed: calcPercent(
          Number(usage.storageBytesUsed) || 0,
          limits?.maxStorageBytes ?? null
        ),
      },
      periodStart: usage.periodStart,
      periodEnd: usage.periodEnd,
    };
  }

  /**
   * Check if AI quota is exceeded (for future enforcement)
   */
  async isAiQuotaExceeded(organizationId: string): Promise<boolean> {
    // Internal orgs never have quota exceeded
    if (await subscriptionService.isInternalOrg(organizationId)) {
      return false;
    }

    const status = await this.getQuotaStatus(organizationId);

    // Unlimited tier
    if (status.aiQueries.limit === null) {
      return false;
    }

    return status.aiQueries.used >= status.aiQueries.limit;
  }

  /**
   * Ensure current billing period record exists
   * Creates one if missing
   */
  async ensureCurrentPeriod(organizationId: string): Promise<UsageTracking> {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .split("T")[0];

    // Try to find existing record for current period
    const existing = await db
      .select()
      .from(usageTracking)
      .where(
        and(
          eq(usageTracking.organizationId, organizationId),
          eq(usageTracking.periodStart, periodStart)
        )
      )
      .limit(1);

    if (existing[0]) {
      return existing[0];
    }

    // Create new period record
    const [newRecord] = await db
      .insert(usageTracking)
      .values({
        organizationId,
        periodStart,
        periodEnd,
        aiQueries: 0,
        documentsUploaded: 0,
        storageBytesUsed: 0,
        integrationSyncs: 0,
      })
      .returning();

    return newRecord;
  }

  /**
   * Get usage history for organization
   */
  async getUsageHistory(organizationId: string, months: number = 12): Promise<UsageTracking[]> {
    return await db
      .select()
      .from(usageTracking)
      .where(eq(usageTracking.organizationId, organizationId))
      .orderBy(desc(usageTracking.periodStart))
      .limit(months);
  }
}

// Singleton instance
export const usageService = new UsageService();
