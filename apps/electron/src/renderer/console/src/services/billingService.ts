/**
 * Billing Service
 *
 * Frontend API client for billing endpoints.
 * Fetches subscription info, usage stats, and quota status.
 */

import { apiRequest } from "./api";
import type {
  SubscriptionResponse,
  UsageResponse,
  QuotaStatus,
  UsageHistoryResponse,
  TierLimitsResponse,
} from "@mitable/shared";

/**
 * Get current subscription with tier limits
 */
export async function fetchSubscription(): Promise<SubscriptionResponse> {
  return apiRequest<SubscriptionResponse>("/billing/subscription");
}

/**
 * Get current period usage details
 */
export async function fetchUsage(): Promise<UsageResponse> {
  return apiRequest<UsageResponse>("/billing/usage");
}

/**
 * Get quota status (usage vs limits comparison)
 */
export async function fetchQuotaStatus(): Promise<QuotaStatus> {
  return apiRequest<QuotaStatus>("/billing/quota");
}

/**
 * Get usage history for past months
 * @param months - Number of months to fetch (default: 12)
 */
export async function fetchUsageHistory(months: number = 12): Promise<UsageHistoryResponse> {
  return apiRequest<UsageHistoryResponse>(`/billing/usage/history?months=${months}`);
}

/**
 * Get all tier limit definitions for comparison
 */
export async function fetchTierLimits(): Promise<TierLimitsResponse> {
  return apiRequest<TierLimitsResponse>("/billing/limits");
}

export const billingService = {
  fetchSubscription,
  fetchUsage,
  fetchQuotaStatus,
  fetchUsageHistory,
  fetchTierLimits,
};
