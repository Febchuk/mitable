/**
 * TierBadge Component
 *
 * Displays the subscription tier with appropriate styling.
 * Free = gray, Pro = blue, Team = purple
 */

import type { SubscriptionTier } from "@mitable/shared";

interface TierBadgeProps {
  tier: SubscriptionTier | string;
  className?: string;
}

const tierConfig: Record<
  string,
  { label: string; bgColor: string; textColor: string; borderColor: string }
> = {
  free: {
    label: "Free",
    bgColor: "bg-gray-500/10",
    textColor: "text-gray-400",
    borderColor: "border-gray-500/20",
  },
  pro: {
    label: "Pro",
    bgColor: "bg-blue-500/10",
    textColor: "text-blue-400",
    borderColor: "border-blue-500/20",
  },
  team: {
    label: "Team",
    bgColor: "bg-purple-500/10",
    textColor: "text-purple-400",
    borderColor: "border-purple-500/20",
  },
};

export default function TierBadge({ tier, className = "" }: TierBadgeProps) {
  const config = tierConfig[tier.toLowerCase()] || tierConfig.free;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-md border ${config.bgColor} ${config.textColor} ${config.borderColor} ${className}`}
    >
      {config.label}
    </span>
  );
}
