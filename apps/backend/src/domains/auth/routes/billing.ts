import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { subscriptionService } from "../services/subscription.service.js";
import { usageService } from "../services/usage.service.js";

const router = Router();

/**
 * GET /billing/subscription
 * Get current subscription with tier limits
 */
router.get("/subscription", requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.organizationId;

    if (!organizationId) {
      res.status(400).json({
        error: "Bad Request",
        message: "Organization ID not found",
      });
      return;
    }

    const subscription = await subscriptionService.getSubscription(organizationId);

    if (!subscription) {
      res.status(404).json({
        error: "Not Found",
        message: "No subscription found for this organization",
      });
      return;
    }

    // Check if internal org
    const isInternal = await subscriptionService.isInternalOrg(organizationId);

    res.json({
      subscription: {
        id: subscription.id,
        tier: subscription.tier,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        trialStart: subscription.trialStart,
        trialEnd: subscription.trialEnd,
      },
      limits: subscription.limits,
      isInternal,
    });
  } catch (error) {
    console.error("Failed to get subscription:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to retrieve subscription",
    });
  }
});

/**
 * GET /billing/usage
 * Get current period usage details
 */
router.get("/usage", requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.organizationId;

    if (!organizationId) {
      res.status(400).json({
        error: "Bad Request",
        message: "Organization ID not found",
      });
      return;
    }

    const usage = await usageService.getCurrentUsage(organizationId);

    res.json({
      usage: {
        aiQueries: usage.aiQueries,
        documentsUploaded: usage.documentsUploaded,
        storageBytesUsed: usage.storageBytesUsed,
        integrationSyncs: usage.integrationSyncs,
        periodStart: usage.periodStart,
        periodEnd: usage.periodEnd,
      },
    });
  } catch (error) {
    console.error("Failed to get usage:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to retrieve usage",
    });
  }
});

/**
 * GET /billing/quota
 * Get quota status with usage vs limits comparison
 */
router.get("/quota", requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.organizationId;

    if (!organizationId) {
      res.status(400).json({
        error: "Bad Request",
        message: "Organization ID not found",
      });
      return;
    }

    const quotaStatus = await usageService.getQuotaStatus(organizationId);

    res.json(quotaStatus);
  } catch (error) {
    console.error("Failed to get quota status:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to retrieve quota status",
    });
  }
});

/**
 * GET /billing/usage/history
 * Get usage history for past months
 */
router.get("/usage/history", requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.organizationId;
    const months = parseInt(req.query.months as string) || 12;

    if (!organizationId) {
      res.status(400).json({
        error: "Bad Request",
        message: "Organization ID not found",
      });
      return;
    }

    const history = await usageService.getUsageHistory(organizationId, months);

    res.json({
      history: history.map((record) => ({
        aiQueries: record.aiQueries,
        documentsUploaded: record.documentsUploaded,
        storageBytesUsed: record.storageBytesUsed,
        integrationSyncs: record.integrationSyncs,
        periodStart: record.periodStart,
        periodEnd: record.periodEnd,
      })),
    });
  } catch (error) {
    console.error("Failed to get usage history:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to retrieve usage history",
    });
  }
});

/**
 * GET /billing/limits
 * Get all tier limit definitions for comparison
 */
router.get("/limits", requireAuth, async (_req: Request, res: Response) => {
  try {
    const allLimits = await subscriptionService.getAllTierLimits();

    res.json({
      tiers: allLimits.map((limit) => ({
        tier: limit.tier,
        monthlyAiQueries: limit.monthlyAiQueries,
        maxDocuments: limit.maxDocuments,
        maxStorageBytes: limit.maxStorageBytes,
        maxTeamMembers: limit.maxTeamMembers,
        maxIntegrations: limit.maxIntegrations,
        syncFrequencyHours: limit.syncFrequencyHours,
        features: limit.features,
      })),
    });
  } catch (error) {
    console.error("Failed to get tier limits:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to retrieve tier limits",
    });
  }
});

export default router;
