import { DlpServiceClient, protos } from "@google-cloud/dlp";
import NodeCache from "node-cache";
import crypto from "crypto";
import sharp from "sharp";
import { config } from "../config.js";

/**
 * PII Redaction Request
 */
export interface PIIRedactionRequest {
  screenshot: string; // Base64 data URL
}

/**
 * PII Redaction Response
 */
export interface PIIRedactionResponse {
  success: boolean;
  redactedScreenshot: string; // Base64 data URL with PII redacted
  detectionTime: number; // milliseconds
  piiCount: number; // Number of PII regions redacted
  cached: boolean;
  metadata?: {
    originalWidth: number;
    originalHeight: number;
    processedWidth: number;
    processedHeight: number;
  };
  error?: string;
}

/**
 * PII types to detect and redact
 *
 * High-sensitivity types (always redacted):
 * - CREDIT_CARD_NUMBER
 * - US_SOCIAL_SECURITY_NUMBER
 * - Secrets (API keys, tokens, passwords)
 *
 * Standard types (redacted if likelihood >= POSSIBLE):
 * - PERSON_NAME, EMAIL_ADDRESS, PHONE_NUMBER, STREET_ADDRESS
 */
const PII_INFO_TYPES = [
  // Personal Information
  "PERSON_NAME",
  "EMAIL_ADDRESS",
  "PHONE_NUMBER",
  "STREET_ADDRESS",

  // Financial
  "CREDIT_CARD_NUMBER",
  "US_SOCIAL_SECURITY_NUMBER",

  // Secrets & Credentials (critical!)
  "AUTH_TOKEN",
  "PASSWORD",
  "ENCRYPTION_KEY",
  "GCP_API_KEY",
  "AWS_CREDENTIALS",
  "AZURE_AUTH_TOKEN",
  "JSON_WEB_TOKEN",
] as const;

/**
 * PII Redaction Service
 *
 * Uses Google Cloud DLP API to detect and redact PII from screenshots.
 * DLP performs OCR + detection + redaction server-side with black rectangles.
 *
 * Caching: Results are cached by screenshot hash (SHA-256) with 1-hour TTL
 * to reduce API calls and costs.
 */
class PIIRedactionService {
  private dlpClient: DlpServiceClient | null = null;
  private cache: NodeCache;
  private projectId: string | null = null;

  constructor() {
    // Initialize cache (always safe)
    this.cache = new NodeCache({
      stdTTL: 3600, // 1 hour
      maxKeys: 100,
      checkperiod: 600, // Check for expired entries every 10 minutes
    });

    // Don't validate or initialize DLP client in constructor
    // This allows tests to import without requiring Google Cloud credentials
  }

  /**
   * Lazy initialization of DLP client
   * Only initializes when actually needed
   */
  private initializeDLPClient(): void {
    if (this.dlpClient) {
      return; // Already initialized
    }

    // Validate configuration
    if (!config.googleCloud.projectId) {
      throw new Error(
        "GOOGLE_CLOUD_PROJECT_ID is not configured. Please set it in your .env file."
      );
    }

    if (!config.googleCloud.keyPath) {
      throw new Error("GOOGLE_CLOUD_KEY_PATH is not configured. Please set it in your .env file.");
    }

    this.projectId = config.googleCloud.projectId;

    // Initialize Google Cloud DLP client
    this.dlpClient = new DlpServiceClient({
      projectId: this.projectId,
      keyFilename: config.googleCloud.keyPath,
    });

    console.log(`[PIIRedactionService] Initialized with project: ${this.projectId}`);
  }

  /**
   * Preprocess image for better OCR accuracy
   * Following ChatGPT's recommendations:
   * 1. Upscale 1.5x for better text recognition
   * 2. Grayscale to reduce noise
   * 3. Normalize contrast
   * 4. Keep as lossless PNG
   */
  private async preprocessImage(imageBuffer: Buffer): Promise<{
    processedBuffer: Buffer;
    originalWidth: number;
    originalHeight: number;
    processedWidth: number;
    processedHeight: number;
  }> {
    const metadata = await sharp(imageBuffer).metadata();
    const origW = metadata.width || 1920;
    const origH = metadata.height || 1080;

    // Upscale 1.5x (unless already very large)
    const targetW = Math.min(2200, Math.round(origW * 1.5));

    const processedBuffer = await sharp(imageBuffer)
      .resize({ width: targetW, kernel: "lanczos3" }) // High-quality upscaling
      .grayscale() // Better OCR on grayscale
      .normalise() // Contrast stretch
      .linear(1.2, -10) // Minor contrast tweak
      .toFormat("png") // Lossless PNG
      .toBuffer();

    const processedMetadata = await sharp(processedBuffer).metadata();

    console.log("[PIIRedactionService] Image preprocessing:", {
      original: { width: origW, height: origH },
      processed: { width: processedMetadata.width, height: processedMetadata.height },
    });

    return {
      processedBuffer,
      originalWidth: origW,
      originalHeight: origH,
      processedWidth: processedMetadata.width || targetW,
      processedHeight: processedMetadata.height || Math.round((origH * targetW) / origW),
    };
  }

  /**
   * Redact PII from a screenshot using Google Cloud DLP
   *
   * @param request - Screenshot as base64 data URL
   * @returns Fully redacted screenshot with black rectangles over PII
   */
  async redactScreenshot(request: PIIRedactionRequest): Promise<PIIRedactionResponse> {
    const startTime = Date.now();

    try {
      // Ensure DLP client is initialized
      this.initializeDLPClient();

      // Generate cache key from screenshot hash
      const cacheKey = this.generateCacheKey(request.screenshot);

      // Check cache
      const cached = this.cache.get<{
        redactedScreenshot: string;
        metadata: any;
        piiCount: number;
      }>(cacheKey);
      if (cached) {
        console.log("[PIIRedactionService] Cache HIT:", cacheKey.substring(0, 8));
        return {
          success: true,
          redactedScreenshot: cached.redactedScreenshot,
          detectionTime: Date.now() - startTime,
          piiCount: cached.piiCount,
          metadata: cached.metadata,
          cached: true,
        };
      }

      console.log("[PIIRedactionService] Cache MISS - calling DLP API");

      // Parse base64 data URL
      const base64Data = this.extractBase64Data(request.screenshot);
      const imageBuffer = Buffer.from(base64Data, "base64");

      // Preprocess image for better OCR
      const { processedBuffer, originalWidth, originalHeight, processedWidth, processedHeight } =
        await this.preprocessImage(imageBuffer);

      // Configure DLP request (use PREPROCESSED buffer)
      const dlpRequest: protos.google.privacy.dlp.v2.IRedactImageRequest = {
        parent: `projects/${this.projectId}/locations/global`,
        byteItem: {
          type: protos.google.privacy.dlp.v2.ByteContentItem.BytesType.IMAGE_PNG,
          data: processedBuffer, // Use preprocessed image
        },
        inspectConfig: {
          infoTypes: PII_INFO_TYPES.map((name) => ({ name })),
          minLikelihood: protos.google.privacy.dlp.v2.Likelihood.POSSIBLE, // 40%+ confidence
        },
        imageRedactionConfigs: PII_INFO_TYPES.map((name) => ({
          infoType: { name },
          // Black rectangle (default color)
        })),
      };

      // Call DLP API (dlpClient is guaranteed to be initialized by initializeDLPClient)
      const [response] = await this.dlpClient!.redactImage(dlpRequest);

      if (!response.redactedImage) {
        throw new Error("DLP API returned empty redacted image");
      }

      // Convert Buffer back to base64 data URL
      const redactedBase64 = response.redactedImage.toString("base64");
      const redactedScreenshot = `data:image/png;base64,${redactedBase64}`;

      // Count PII regions (approximate - DLP doesn't return exact count in redactImage)
      const piiCount = response.extractedText ? 1 : 0; // Simplified

      const metadata = {
        originalWidth,
        originalHeight,
        processedWidth,
        processedHeight,
      };

      // Store in cache (with metadata)
      this.cache.set(cacheKey, { redactedScreenshot, metadata, piiCount });

      const detectionTime = Date.now() - startTime;

      console.log(
        `[PIIRedactionService] Redaction complete: ${detectionTime}ms, ` +
          `PII regions: ${piiCount}, cached: false`
      );

      return {
        success: true,
        redactedScreenshot,
        detectionTime,
        piiCount,
        metadata,
        cached: false,
      };
    } catch (error) {
      const detectionTime = Date.now() - startTime;
      console.error("[PIIRedactionService] Redaction failed:", error);

      // On error, return original screenshot (no redaction)
      return {
        success: false,
        redactedScreenshot: request.screenshot, // Return original
        detectionTime,
        piiCount: 0,
        cached: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Generate SHA-256 hash of screenshot for caching
   */
  private generateCacheKey(screenshot: string): string {
    return crypto.createHash("sha256").update(screenshot).digest("hex");
  }

  /**
   * Extract base64 data from data URL
   * Handles both "data:image/png;base64,..." and raw base64
   */
  private extractBase64Data(dataUrl: string): string {
    if (dataUrl.startsWith("data:")) {
      const parts = dataUrl.split(",");
      if (parts.length !== 2) {
        throw new Error("Invalid data URL format");
      }
      return parts[1];
    }
    return dataUrl;
  }

  /**
   * Clear the cache (useful for testing)
   */
  clearCache(): void {
    this.cache.flushAll();
    console.log("[PIIRedactionService] Cache cleared");
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      keys: this.cache.keys().length,
      hits: this.cache.getStats().hits,
      misses: this.cache.getStats().misses,
      hitRate:
        this.cache.getStats().hits / (this.cache.getStats().hits + this.cache.getStats().misses) ||
        0,
    };
  }
}

// Export singleton instance
export const piiRedactionService = new PIIRedactionService();
