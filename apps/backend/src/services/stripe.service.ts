import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { subscriptions, organizations } from "../db/schema/index.js";
import { config } from "../config.js";
import type { SubscriptionTier } from "../db/schema/billing.schema.js";

const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: "2026-01-28.clover",
});

/**
 * Extract billing period from a Stripe subscription's first item.
 * In Stripe API 2026+, current_period_start/end live on SubscriptionItem, not Subscription.
 */
function extractPeriod(stripeSub: Stripe.Subscription) {
  const item = stripeSub.items.data[0];
  return {
    start: item ? new Date(item.current_period_start * 1000) : new Date(),
    end: item ? new Date(item.current_period_end * 1000) : new Date(),
  };
}

/**
 * Extract subscription ID from an Invoice's parent field.
 * In Stripe API 2026+, invoice.subscription was replaced by invoice.parent.subscription_details.
 */
function extractSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const subDetails = invoice.parent?.subscription_details;
  if (!subDetails) return null;
  return typeof subDetails.subscription === "string"
    ? subDetails.subscription
    : subDetails.subscription?.id ?? null;
}

/**
 * Stripe Service
 *
 * Manages Stripe customer creation, checkout sessions, portal sessions,
 * and webhook event handling for subscription lifecycle.
 */
class StripeService {
  /**
   * Get or create a Stripe customer for an organization.
   * Caches the Stripe customer ID in the subscriptions table.
   */
  async getOrCreateCustomer(organizationId: string): Promise<string> {
    const [sub] = await db
      .select({ stripeCustomerId: subscriptions.stripeCustomerId })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, organizationId))
      .limit(1);

    if (sub?.stripeCustomerId) {
      return sub.stripeCustomerId;
    }

    const [org] = await db
      .select({ name: organizations.name, domain: organizations.domain })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    const customer = await stripe.customers.create({
      metadata: { organizationId },
      ...(org?.name && { name: org.name }),
      ...(org?.domain && { email: `billing@${org.domain}` }),
    });

    await db
      .update(subscriptions)
      .set({
        stripeCustomerId: customer.id,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.organizationId, organizationId));

    return customer.id;
  }

  /**
   * Create a Stripe Checkout Session for upgrading to a paid plan.
   */
  async createCheckoutSession(
    organizationId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<string> {
    const customerId = await this.getOrCreateCustomer(organizationId);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { organizationId },
      subscription_data: {
        metadata: { organizationId },
      },
    });

    return session.url!;
  }

  /**
   * Create a Stripe Customer Portal session for managing subscription.
   */
  async createPortalSession(organizationId: string, returnUrl: string): Promise<string> {
    const customerId = await this.getOrCreateCustomer(organizationId);

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return session.url;
  }

  /**
   * Construct and verify a Stripe webhook event.
   */
  constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
    return stripe.webhooks.constructEvent(payload, signature, config.stripe.webhookSecret);
  }

  /**
   * Handle checkout.session.completed — activate subscription.
   */
  async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const organizationId = session.metadata?.organizationId;
    if (!organizationId) {
      console.warn("[Stripe] checkout.session.completed missing organizationId metadata");
      return;
    }

    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id;

    if (!subscriptionId) {
      console.warn("[Stripe] checkout.session.completed missing subscription ID");
      return;
    }

    const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
    const priceId = stripeSub.items.data[0]?.price.id;
    const tier = this.priceIdToTier(priceId);
    const period = extractPeriod(stripeSub);

    await db
      .update(subscriptions)
      .set({
        stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: priceId,
        tier,
        status: "active",
        currentPeriodStart: period.start,
        currentPeriodEnd: period.end,
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.organizationId, organizationId));

    console.info(`[Stripe] Subscription activated for org ${organizationId}: tier=${tier}`);
  }

  /**
   * Handle customer.subscription.updated — sync tier/status changes.
   */
  async handleSubscriptionUpdated(stripeSub: Stripe.Subscription): Promise<void> {
    const organizationId = stripeSub.metadata?.organizationId;
    if (!organizationId) {
      console.warn("[Stripe] subscription.updated missing organizationId metadata");
      return;
    }

    const priceId = stripeSub.items.data[0]?.price.id;
    const tier = this.priceIdToTier(priceId);
    const status = this.mapStripeStatus(stripeSub.status);
    const period = extractPeriod(stripeSub);

    await db
      .update(subscriptions)
      .set({
        stripePriceId: priceId,
        tier,
        status,
        currentPeriodStart: period.start,
        currentPeriodEnd: period.end,
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.organizationId, organizationId));

    console.info(`[Stripe] Subscription updated for org ${organizationId}: tier=${tier}, status=${status}`);
  }

  /**
   * Handle customer.subscription.deleted — mark as canceled.
   */
  async handleSubscriptionDeleted(stripeSub: Stripe.Subscription): Promise<void> {
    const organizationId = stripeSub.metadata?.organizationId;
    if (!organizationId) {
      console.warn("[Stripe] subscription.deleted missing organizationId metadata");
      return;
    }

    await db
      .update(subscriptions)
      .set({
        status: "canceled",
        cancelledAt: new Date(),
        tier: "free",
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.organizationId, organizationId));

    console.info(`[Stripe] Subscription canceled for org ${organizationId}`);
  }

  /**
   * Handle invoice.payment_failed — mark as past_due.
   */
  async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const subscriptionId = extractSubscriptionIdFromInvoice(invoice);
    if (!subscriptionId) return;

    const [sub] = await db
      .select({ organizationId: subscriptions.organizationId })
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, subscriptionId))
      .limit(1);

    if (!sub) {
      console.warn(`[Stripe] payment_failed: no subscription found for ${subscriptionId}`);
      return;
    }

    await db
      .update(subscriptions)
      .set({
        status: "past_due",
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.organizationId, sub.organizationId));

    console.info(`[Stripe] Payment failed for org ${sub.organizationId}`);
  }

  /**
   * Map a Stripe price ID to an internal tier.
   */
  private priceIdToTier(priceId: string | undefined): SubscriptionTier {
    if (!priceId) return "free";
    if (priceId === config.stripe.proPriceId) return "pro";
    if (priceId === config.stripe.teamPriceId) return "team";
    return "pro";
  }

  /**
   * Map Stripe subscription status to internal status.
   */
  private mapStripeStatus(
    stripeStatus: Stripe.Subscription.Status
  ): "active" | "trialing" | "past_due" | "canceled" | "unpaid" {
    switch (stripeStatus) {
      case "active":
        return "active";
      case "trialing":
        return "trialing";
      case "past_due":
        return "past_due";
      case "canceled":
        return "canceled";
      case "unpaid":
        return "unpaid";
      default:
        return "active";
    }
  }
}

export const stripeService = new StripeService();
