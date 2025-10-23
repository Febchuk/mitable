/**
 * PII Detection Types
 *
 * Shared types for PII (Personally Identifiable Information) detection
 * and redaction pipeline used in UI guidance feature.
 *
 * Uses Google Cloud DLP API for server-side detection and returns
 * bounding box regions for client-side blurring.
 */

/**
 * PII Region detected by Google Cloud DLP API
 * Represents a rectangular area in the screenshot containing PII
 */
export interface PIIRegion {
  /** X coordinate (left edge) in pixels */
  x: number;
  /** Y coordinate (top edge) in pixels */
  y: number;
  /** Width of the region in pixels */
  width: number;
  /** Height of the region in pixels */
  height: number;
  /** Type of PII detected in this region */
  type: PIIType;
  /** Confidence level of the detection */
  likelihood: PIILikelihood;
}

/**
 * Supported PII types detected by DLP API
 *
 * Standard types from Google Cloud DLP plus custom additions:
 * - SSN (US_SOCIAL_SECURITY_NUMBER)
 * - API keys and secrets
 * - Credit card numbers
 * - Phone numbers
 */
export type PIIType =
  | "PERSON_NAME"
  | "EMAIL_ADDRESS"
  | "PHONE_NUMBER"
  | "STREET_ADDRESS"
  | "CREDIT_CARD_NUMBER"
  | "US_SOCIAL_SECURITY_NUMBER" // SSN
  | "API_KEY" // API keys, secrets, tokens
  | "CUSTOM_IDENTIFIER"
  | "UNKNOWN";

/**
 * DLP API likelihood levels
 * Indicates confidence of PII detection
 */
export type PIILikelihood = "VERY_UNLIKELY" | "UNLIKELY" | "POSSIBLE" | "LIKELY" | "VERY_LIKELY";

/**
 * Minimum likelihood threshold for redaction
 * PII detected with this level or higher will be redacted
 */
export const PII_REDACTION_THRESHOLD: PIILikelihood = "POSSIBLE";

/**
 * PII types that should always be redacted regardless of likelihood
 * High-sensitivity data that must be protected
 */
export const ALWAYS_REDACT_TYPES: PIIType[] = [
  "US_SOCIAL_SECURITY_NUMBER",
  "CREDIT_CARD_NUMBER",
  "API_KEY",
];

/**
 * PII Detection Request (frontend → backend)
 * Sent when requesting PII detection on a screenshot
 */
export interface PIIDetectionRequest {
  /** Screenshot as base64 data URL (e.g., "data:image/png;base64,...") */
  screenshot: string;
}

/**
 * PII Detection Response (backend → frontend)
 * Contains detected PII regions and metadata
 */
export interface PIIDetectionResponse {
  /** Whether detection completed successfully */
  success: boolean;
  /** Array of detected PII regions with bounding boxes */
  piiRegions: PIIRegion[];
  /** Detection processing time in milliseconds */
  detectionTime: number;
  /** Whether result was served from cache */
  cached: boolean;
  /** Error message if success is false */
  error?: string;
}

/**
 * Blur options for client-side blurring
 * Used by frontend Canvas API to blur detected regions
 */
export interface BlurOptions {
  /** Blur intensity (default: 10) */
  intensity?: number;
  /** PII regions to blur */
  regions: PIIRegion[];
  /** Extra pixels to add around each region for better coverage (default: 5) */
  padding?: number;
}

/**
 * Type guard to check if an object is a valid PIIRegion
 * Useful for runtime validation of API responses
 */
export function isPIIRegion(obj: unknown): obj is PIIRegion {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }

  const region = obj as Record<string, unknown>;

  return (
    typeof region.x === "number" &&
    typeof region.y === "number" &&
    typeof region.width === "number" &&
    typeof region.height === "number" &&
    typeof region.type === "string" &&
    typeof region.likelihood === "string"
  );
}

/**
 * Check if a PII region should be redacted based on type and likelihood
 *
 * @param region - The PII region to check
 * @returns True if the region should be redacted
 */
export function shouldRedact(region: PIIRegion): boolean {
  // Always redact high-sensitivity types (SSN, credit cards, API keys)
  if (ALWAYS_REDACT_TYPES.includes(region.type)) {
    return true;
  }

  // For all other types (names, emails, phones, addresses, etc.),
  // check likelihood threshold
  const likelihoodOrder: PIILikelihood[] = [
    "VERY_UNLIKELY",
    "UNLIKELY",
    "POSSIBLE",
    "LIKELY",
    "VERY_LIKELY",
  ];

  const regionLikelihoodIndex = likelihoodOrder.indexOf(region.likelihood);
  const thresholdIndex = likelihoodOrder.indexOf(PII_REDACTION_THRESHOLD);

  return regionLikelihoodIndex >= thresholdIndex;
}
