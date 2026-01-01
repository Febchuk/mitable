import { Request, Response, NextFunction } from "express";
import { usageService } from "../services/usage.service.js";
import { subscriptionService } from "../services/subscription.service.js";

/**
 * Usage Tracking Middleware
 *
 * Soft enforcement: tracks AI usage but doesn't block requests.
 * Internal orgs are skipped entirely.
 */

/**
 * Track AI query usage
 * Increments counter after successful AI responses
 */
export async function trackAiUsage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const organizationId = req.organizationId;

  // No org ID - skip tracking
  if (!organizationId) {
    next();
    return;
  }

  // Skip tracking for internal orgs
  try {
    const isInternal = await subscriptionService.isInternalOrg(organizationId);
    if (isInternal) {
      next();
      return;
    }
  } catch (error) {
    // If check fails, continue without tracking
    console.error("Failed to check internal org status:", error);
    next();
    return;
  }

  // Track usage after successful response
  res.on("finish", async () => {
    // Only count successful responses (2xx status codes)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      try {
        await usageService.incrementAiQueries(organizationId);
      } catch (error) {
        // Log but don't fail - usage tracking is non-critical
        console.error("Failed to track AI usage:", error);
      }
    }
  });

  next();
}

/**
 * Track document upload usage
 */
export async function trackDocumentUpload(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const organizationId = req.organizationId;

  if (!organizationId) {
    next();
    return;
  }

  try {
    const isInternal = await subscriptionService.isInternalOrg(organizationId);
    if (isInternal) {
      next();
      return;
    }
  } catch (error) {
    console.error("Failed to check internal org status:", error);
    next();
    return;
  }

  res.on("finish", async () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      try {
        await usageService.incrementDocuments(organizationId);
      } catch (error) {
        console.error("Failed to track document upload:", error);
      }
    }
  });

  next();
}

/**
 * Track integration sync usage
 */
export async function trackIntegrationSync(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const organizationId = req.organizationId;

  if (!organizationId) {
    next();
    return;
  }

  try {
    const isInternal = await subscriptionService.isInternalOrg(organizationId);
    if (isInternal) {
      next();
      return;
    }
  } catch (error) {
    console.error("Failed to check internal org status:", error);
    next();
    return;
  }

  res.on("finish", async () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      try {
        await usageService.incrementIntegrationSyncs(organizationId);
      } catch (error) {
        console.error("Failed to track integration sync:", error);
      }
    }
  });

  next();
}
