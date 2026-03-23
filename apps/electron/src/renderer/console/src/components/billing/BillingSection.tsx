/**
 * BillingSection Component
 *
 * Displays subscription tier, usage stats, and quota status.
 * For use in the Settings page.
 */

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Infinity, AlertCircle } from "lucide-react";
import { useSubscription, useQuotaStatus } from "../../hooks/queries/billing";
import TierBadge from "./TierBadge";
import UsageMeter from "./UsageMeter";

export default function BillingSection() {
  const { data: subscriptionData, isLoading: isLoadingSubscription } = useSubscription();
  const { data: quotaData, isLoading: isLoadingQuota } = useQuotaStatus();

  const isLoading = isLoadingSubscription || isLoadingQuota;

  if (isLoading) {
    return (
      <Card className="p-6 bg-background-elevated border-border-subtle">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </Card>
    );
  }

  const subscription = subscriptionData?.subscription;
  const isInternal = subscriptionData?.isInternal || false;
  const isUnlimited = quotaData?.tier === "team" || isInternal;

  return (
    <Card className="p-6 bg-background-elevated border-border-subtle">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">Subscription</h3>
          <p className="text-sm text-muted-foreground mt-1">Your current plan and usage</p>
        </div>
        <div className="flex items-center gap-2">
          {subscription?.tier && <TierBadge tier={subscription.tier} />}
          {isInternal && (
            <Badge variant="outline" className="text-xs text-blue-400 border-blue-400/30">
              Internal
            </Badge>
          )}
        </div>
      </div>

      {/* Usage Stats */}
      <div className="space-y-6">
        {isUnlimited ? (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-purple-500/5 border border-purple-500/20">
            <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
              <Infinity className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-text-primary font-medium">Unlimited Usage</p>
              <p className="text-sm text-muted-foreground">
                {isInternal
                  ? "Internal account - all limits bypassed"
                  : "Team tier - unlimited access to all features"}
              </p>
            </div>
          </div>
        ) : quotaData ? (
          <div className="space-y-4">
            <UsageMeter
              label="AI Queries"
              used={quotaData.aiQueries.used}
              limit={quotaData.aiQueries.limit}
            />
            <UsageMeter
              label="Documents"
              used={quotaData.documents.used}
              limit={quotaData.documents.limit}
            />
            {quotaData.storage.limitBytes !== null && (
              <UsageMeter
                label="Storage"
                used={Math.round(quotaData.storage.usedBytes / (1024 * 1024))} // Convert to MB
                limit={Math.round(quotaData.storage.limitBytes / (1024 * 1024))}
              />
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
            <AlertCircle className="w-5 h-5 text-yellow-400" />
            <p className="text-sm text-yellow-400">Unable to load usage data</p>
          </div>
        )}
      </div>

      {/* Billing Period */}
      {quotaData && !isUnlimited && (
        <div className="mt-6 pt-4 border-t border-border-subtle">
          <p className="text-xs text-muted-foreground">
            Current period: {new Date(quotaData.periodStart).toLocaleDateString()} -{" "}
            {new Date(quotaData.periodEnd).toLocaleDateString()}
          </p>
        </div>
      )}
    </Card>
  );
}
