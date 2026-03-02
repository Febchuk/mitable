/**
 * Shared Pricing Configuration
 *
 * Single source of truth for pricing tiers, Stripe price IDs, and feature lists.
 * Used by: website pricing page, backend for validation, desktop app for plan display.
 */

import type { SubscriptionTier } from "./billing.js";

export interface PricingTier {
  /** Internal tier ID matching SubscriptionTier */
  id: SubscriptionTier;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Whether this tier is highlighted/featured */
  highlighted: boolean;
  /** CTA button text */
  cta: string;
  /** Whether this tier requires contacting sales (no Stripe checkout) */
  contactSales: boolean;
  /** Feature list for display */
  features: string[];
  /** Regional pricing info */
  pricing: {
    global: {
      amount: number; // cents (0 = free, -1 = custom/contact)
      currency: "usd";
      displayPrice: string;
      period: string;
      stripePriceId: string | null;
    };
    ng: {
      amount: number; // kobo
      currency: "ngn";
      displayPrice: string;
      period: string;
      stripePriceId: string | null;
    };
  };
}

export type PricingRegion = "global" | "ng";

export const PRICING_TIERS: PricingTier[] = [
  {
    id: "free",
    name: "Free",
    description: "Get started",
    highlighted: false,
    cta: "Get Started",
    contactSales: false,
    features: ["5 Sessions/month", "Local storage", "Smart summaries", "24/7 Access to Founders"],
    pricing: {
      global: {
        amount: 0,
        currency: "usd",
        displayPrice: "$0",
        period: "",
        stripePriceId: null,
      },
      ng: {
        amount: 0,
        currency: "ngn",
        displayPrice: "₦0",
        period: "",
        stripePriceId: null,
      },
    },
  },
  {
    id: "pro",
    name: "Pro",
    description: "For serious makers",
    highlighted: true,
    cta: "Start Free Trial",
    contactSales: false,
    features: [
      "Everything in Free",
      "Unlimited sessions",
      "Doc & artefact export",
      "30-day history",
      "Priority support",
      "24/7 Access to Founders",
    ],
    pricing: {
      global: {
        amount: 1200, // $12.00
        currency: "usd",
        displayPrice: "$12",
        period: "/month",
        stripePriceId: "price_1T6Plv1Utpl6gAFBJzpOKlDH",
      },
      ng: {
        amount: 1000000, // ₦10,000
        currency: "ngn",
        displayPrice: "₦10,000",
        period: "/month",
        stripePriceId: "price_1T6Plz1Utpl6gAFBZBFgt5SD",
      },
    },
  },
  {
    id: "team",
    name: "Enterprise",
    description: "For teams",
    highlighted: false,
    cta: "Contact Sales",
    contactSales: true,
    features: [
      "Everything in Pro",
      "Team workspace",
      "Shared docs & artefacts",
      "SSO integration",
      "Dedicated support",
      "24/7 Access to Founders",
    ],
    pricing: {
      global: {
        amount: -1,
        currency: "usd",
        displayPrice: "Custom",
        period: "",
        stripePriceId: null,
      },
      ng: {
        amount: -1,
        currency: "ngn",
        displayPrice: "Custom",
        period: "",
        stripePriceId: null,
      },
    },
  },
];

/** Get a pricing tier by its ID */
export function getPricingTier(tierId: SubscriptionTier): PricingTier | undefined {
  return PRICING_TIERS.find((t) => t.id === tierId);
}

/** Get the display price for a tier in a given region */
export function getTierDisplayPrice(
  tierId: SubscriptionTier,
  region: PricingRegion
): { displayPrice: string; period: string } | undefined {
  const tier = getPricingTier(tierId);
  if (!tier) return undefined;
  const p = tier.pricing[region];
  return { displayPrice: p.displayPrice, period: p.period };
}
