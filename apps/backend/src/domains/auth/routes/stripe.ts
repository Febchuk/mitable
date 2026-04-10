import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { stripeService } from "../services/stripe.service.js";
import { config } from "../../../config.js";
import { analytics } from "../../shared-infra/lib/analytics.js";

const router = Router();

/**
 * POST /stripe/create-checkout-session
 * Creates a Stripe Checkout session and returns the redirect URL.
 * Requires authentication.
 */
router.post("/create-checkout-session", requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      res.status(400).json({ error: "Bad Request", message: "Organization ID not found" });
      return;
    }

    const { priceId, successUrl, cancelUrl } = req.body;

    if (!priceId || !successUrl || !cancelUrl) {
      res.status(400).json({
        error: "Bad Request",
        message: "priceId, successUrl, and cancelUrl are required",
      });
      return;
    }

    // Validate the price ID is one we recognize
    const validPriceIds = [config.stripe.proPriceId, config.stripe.teamPriceId].filter(Boolean);
    if (!validPriceIds.includes(priceId)) {
      res.status(400).json({ error: "Bad Request", message: "Invalid price ID" });
      return;
    }

    const url = await stripeService.createCheckoutSession(
      organizationId,
      priceId,
      successUrl,
      cancelUrl
    );

    analytics.track(req.userId!, "checkout_session_created", {
      price_id: priceId,
      organization_id: organizationId,
    });

    res.json({ url });
  } catch (error) {
    console.error("Failed to create checkout session:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to create checkout session",
    });
  }
});

/**
 * POST /stripe/create-portal-session
 * Creates a Stripe Customer Portal session and returns the URL.
 * Requires authentication.
 */
router.post("/create-portal-session", requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      res.status(400).json({ error: "Bad Request", message: "Organization ID not found" });
      return;
    }

    const { returnUrl } = req.body;
    if (!returnUrl) {
      res.status(400).json({ error: "Bad Request", message: "returnUrl is required" });
      return;
    }

    const url = await stripeService.createPortalSession(organizationId, returnUrl);
    analytics.track(req.userId!, "billing_portal_opened", { organization_id: organizationId });
    res.json({ url });
  } catch (error) {
    console.error("Failed to create portal session:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to create portal session",
    });
  }
});

/**
 * POST /stripe/webhooks
 * Stripe webhook endpoint. Unauthenticated — verified via Stripe signature.
 * IMPORTANT: This route requires raw body (not JSON-parsed).
 * The raw body middleware is applied in app.ts before the JSON parser.
 */
router.post("/webhooks", async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"] as string;

  if (!signature) {
    res.status(400).json({ error: "Missing stripe-signature header" });
    return;
  }

  try {
    const event = stripeService.constructWebhookEvent(req.body, signature);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        await stripeService.handleCheckoutCompleted(session);
        analytics.track(session.client_reference_id || "stripe", "checkout_completed", {
          subscription_id: session.subscription,
        });
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        await stripeService.handleSubscriptionUpdated(subscription);
        analytics.track(subscription.metadata?.organizationId || "stripe", "subscription_updated", {
          new_status: subscription.status,
        });
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        await stripeService.handleSubscriptionDeleted(subscription);
        analytics.track(subscription.metadata?.organizationId || "stripe", "subscription_cancelled");
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        await stripeService.handlePaymentFailed(invoice);
        analytics.track("stripe", "payment_failed", {
          amount: invoice.amount_due,
        });
        break;
      }
      default:
        // Unhandled event type — acknowledge receipt
        break;
    }

    res.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook error:", error);
    res.status(400).json({
      error: "Webhook Error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
