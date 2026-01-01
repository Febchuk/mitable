/**
 * Billing and Subscription Types
 *
 * Shared types for pricing tiers, subscriptions, and usage tracking.
 */

// Subscription tiers
export type SubscriptionTier = "free" | "pro" | "team";
export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid";

// Account types for signup flow
export type AccountType = "personal" | "team";

// Subscription data
export interface Subscription {
  id: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialStart: string | null;
  trialEnd: string | null;
}

// Usage limits per tier
export interface UsageLimits {
  tier: string;
  monthlyAiQueries: number | null; // null = unlimited
  maxDocuments: number | null;
  maxStorageBytes: number | null;
  maxTeamMembers: number | null;
  maxIntegrations: number | null;
  syncFrequencyHours: number | null;
  features: TierFeatures;
}

// Feature flags per tier
export interface TierFeatures {
  sso?: boolean;
  apiAccess?: boolean;
  auditLogs?: boolean;
  exportData?: boolean;
  prioritySupport?: boolean;
}

// Current period usage
export interface UsageTracking {
  aiQueries: number;
  documentsUploaded: number;
  storageBytesUsed: number;
  integrationSyncs: number;
  periodStart: string;
  periodEnd: string;
}

// Quota status with usage vs limits
export interface QuotaStatus {
  tier: SubscriptionTier;
  isInternal: boolean;
  aiQueries: {
    used: number;
    limit: number | null; // null = unlimited
    remaining: number | null;
    percentUsed: number;
  };
  documents: {
    used: number;
    limit: number | null;
    remaining: number | null;
    percentUsed: number;
  };
  storage: {
    usedBytes: number;
    limitBytes: number | null;
    remainingBytes: number | null;
    percentUsed: number;
  };
  periodStart: string;
  periodEnd: string;
}

// API response types
export interface SubscriptionResponse {
  subscription: Subscription;
  limits: UsageLimits | null;
  isInternal: boolean;
}

export interface UsageResponse {
  usage: UsageTracking;
}

export interface QuotaResponse extends QuotaStatus {}

export interface UsageHistoryResponse {
  history: UsageTracking[];
}

export interface TierLimitsResponse {
  tiers: UsageLimits[];
}
