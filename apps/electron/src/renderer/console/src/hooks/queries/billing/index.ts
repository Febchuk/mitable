/**
 * Billing React Query Hooks
 *
 * Hooks for fetching subscription, usage, and quota data.
 */

import { useQuery } from "@tanstack/react-query";
import {
  fetchSubscription,
  fetchUsage,
  fetchQuotaStatus,
  fetchUsageHistory,
  fetchTierLimits,
} from "../../../services/billingService";
import { useUser } from "../../../context/UserContext";

/**
 * Get current subscription with tier limits
 * Refetches every 5 minutes (subscription data changes infrequently)
 */
export function useSubscription() {
  const { user } = useUser();

  return useQuery({
    queryKey: ["billing", "subscription"],
    queryFn: fetchSubscription,
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Get current period usage details
 * Refetches more frequently (usage changes often)
 */
export function useUsage() {
  const { user } = useUser();

  return useQuery({
    queryKey: ["billing", "usage"],
    queryFn: fetchUsage,
    enabled: !!user,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Get quota status (usage vs limits comparison)
 * Most frequently refreshed for accurate limit warnings
 */
export function useQuotaStatus() {
  const { user } = useUser();

  return useQuery({
    queryKey: ["billing", "quota"],
    queryFn: fetchQuotaStatus,
    enabled: !!user,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Get usage history for past months
 * @param months - Number of months to fetch (default: 12)
 */
export function useUsageHistory(months: number = 12) {
  const { user } = useUser();

  return useQuery({
    queryKey: ["billing", "usage", "history", months],
    queryFn: () => fetchUsageHistory(months),
    enabled: !!user,
    staleTime: 10 * 60 * 1000, // 10 minutes (historical data doesn't change much)
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Get all tier limit definitions for comparison
 * Cache for a long time (tier definitions rarely change)
 */
export function useTierLimits() {
  const { user } = useUser();

  return useQuery({
    queryKey: ["billing", "limits"],
    queryFn: fetchTierLimits,
    enabled: !!user,
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
  });
}
