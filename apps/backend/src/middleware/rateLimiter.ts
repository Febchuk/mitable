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
 * Limit: 100 requests per 15 minutes per IP
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: "Too many requests from this IP, please try again later.",
    retryAfter: "15 minutes",
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
 * Limit: 5 requests per 15 minutes per IP
 * Stricter limit to prevent brute-force attacks
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    error:
      "Too many authentication attempts from this IP, please try again later.",
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
 * Limit: 20 requests per 15 minutes per IP
 * Moderate limit to prevent excessive AI compute usage while allowing normal workflow
 */
export const screenshotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per windowMs
  message: {
    error:
      "Too many screenshot analysis requests from this IP, please try again later.",
    retryAfter: "15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
