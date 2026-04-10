import rateLimit from "express-rate-limit";

/**
 * Rate Limiting Middleware
 *
 * Implements tiered rate limiting to prevent API abuse and DDoS attacks.
 * Uses in-memory store by default (works for single-instance deployments).
 *
 * For multi-instance production deployments, consider using Redis store:
 * https://github.com/express-rate-limit/rate-limit-redis
 */

/**
 * General API Rate Limiter
 * Applied to all API routes by default
 *
 * Limit: 1000 requests per 1 minute per IP (ultra relaxed)
 */
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: {
    error: "Too many requests from this IP, please try again later.",
    retryAfter: "1 minute",
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  // Skip rate limiting for health check endpoint
  skip: (req) => req.path === "/health",
});

/**
 * Auth Rate Limiter
 * Applied to authentication endpoints (login, signup, password reset)
 *
 * Limit: 100 requests per 15 minutes per IP (relaxed)
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: "Too many authentication attempts from this IP, please try again later.",
    retryAfter: "15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Optionally skip successful requests (only count failed auth attempts)
  skipSuccessfulRequests: false,
});

/**
 * Screenshot Analysis Rate Limiter
 * Applied to AI-powered screenshot analysis endpoints
 *
 * Limit: 500 requests per 1 minute per IP (ultra relaxed)
 */
export const screenshotLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 500, // Limit each IP to 500 requests per windowMs
  message: {
    error: "Too many screenshot analysis requests from this IP, please try again later.",
    retryAfter: "1 minute",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Feedback submissions — triggers Haiku log analysis (costly). Per authenticated user.
 */
export const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 6,
  message: {
    error: "Too many feedback submissions. Please try again later.",
    retryAfter: "1 hour",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const uid = req.userId;
    return uid ? `feedback:user:${uid}` : `feedback:ip:${req.ip ?? "unknown"}`;
  },
});
