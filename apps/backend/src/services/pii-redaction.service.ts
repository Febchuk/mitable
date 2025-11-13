import { createWorker } from "tesseract.js";
import type { Worker } from "tesseract.js";
import NodeCache from "node-cache";
import crypto from "crypto";
import sharp from "sharp";

/**
 * Local type definitions - no need to import from shared package
 */
export interface PIIDetectionRequest {
  screenshot: string; // Base64 data URL
}

export interface PIIDetectionResponse {
  success: boolean;
  redactedScreenshot: string; // Base64 data URL with PII redacted
  detectionTime: number; // milliseconds
  piiCount: number; // Number of PII instances detected
  metadata: {
    originalWidth: number;
    originalHeight: number;
    processedWidth: number;
    processedHeight: number;
  };
  cached: boolean;
  error?: string;
}

/**
 * PII & Secret Detection Patterns
 *
 * Personal Information:
 * - EMAIL_ADDRESS (partial matches supported)
 * - PHONE_NUMBER (international formats)
 * - US_SOCIAL_SECURITY_NUMBER (various formats)
 * - CREDIT_CARD_NUMBER (with Luhn validation)
 * - DATE (various formats like MM/DD/YYYY, Month DD YYYY, etc.)
 * - EMPLOYEE_ID (formats like EMP-2020-1234, ID-1234, etc.)
 * - US_STREET_ADDRESS (street addresses like "1234 Main St Apt 5B")
 * - US_CITY_STATE_ZIP (city/state/zip like "San Francisco, CA 94103")
 * - DATABASE_URL (PostgreSQL, MySQL, MongoDB, Redis connection strings)
 * - DATABASE_PASSWORD (extracted from connection strings)
 * - PASSWORD_IN_URL (http://user:pass@host)
 * - SUPABASE_URL (project URLs)
 *
 * Database & Connection Strings:
 * - DATABASE_URL (PostgreSQL, MySQL, MongoDB, Redis)
 * - DATABASE_PASSWORD (extracted from connection strings)
 * - PASSWORD_IN_URL (http://user:pass@host)
 * - SUPABASE_URL (project URLs)
 *
 * Provider-Specific API Keys:
 * - OPENAI_API_KEY (sk-... format)
 * - AWS_ACCESS_KEY (AKIA... format)
 * - AWS_SECRET_KEY (40-char base64)
 * - GOOGLE_API_KEY (AIza... format)
 * - GITHUB_TOKEN (ghp_, gho_, ghs_, ghu_)
 * - SLACK_TOKEN (xox[baprs]-...)
 * - STRIPE_KEY (sk_live_, pk_live_)
 *
 * Generic Secrets:
 * - JWT_TOKEN (eyJ... format)
 * - BEARER_TOKEN (Authorization headers)
 * - API_KEY_GENERIC (32+ char strings)
 * - PRIVATE_KEY (PEM format)
 * - ENV_SECRET (KEY=value in .env files)
 */
interface PIIPattern {
  type: string;
  pattern: RegExp;
  validator?: (text: string) => boolean;
}

const PII_PATTERNS: PIIPattern[] = [
  // ===== Personal Information =====
  {
    type: "EMAIL_ADDRESS",
    // Lenient: matches partial emails, allows trailing dots
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.?[A-Za-z]{0,}/g,
  },
  {
    type: "PHONE_NUMBER",
    // More strict: requires at least 10 digits total, with common separators
    pattern: /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  },
  {
    type: "US_SOCIAL_SECURITY_NUMBER",
    // Matches XXX-XX-XXXX, XXX-XXXX-XXXX, or XXXXXXXXX
    pattern: /\b\d{3}[-\s]?\d{2,4}[-\s]?\d{4}\b/g,
  },
  {
    type: "US_STREET_ADDRESS",
    // Matches street addresses like "1234 Main St", "123 Oak Avenue Apt 5B"
    // CHECK BEFORE CREDIT_CARD to avoid false matches
    pattern:
      /\b\d{1,6}\s+(?:[A-Z][a-z]+\s+){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Way|Place|Pl|Parkway|Pkwy|Circle|Cir)(?:\s+(?:Apt|Apartment|Suite|Ste|Unit|#)\s*[A-Za-z0-9]+)?\b/gi,
  },
  {
    type: "US_CITY_STATE_ZIP",
    // Matches "San Francisco, CA 94103" or "New York, NY 10001"
    // CHECK BEFORE CREDIT_CARD to avoid false matches
    pattern: /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/g,
  },
  {
    type: "CREDIT_CARD_NUMBER",
    // Matches 13-19 digit sequences with Luhn validation
    pattern: /\b(?:\d[-\s]?){12,18}\d\b/g,
    validator: (text: string) => {
      const digits = text.replace(/\D/g, "");
      if (digits.length < 13 || digits.length > 19) return false;
      let sum = 0;
      let isEven = false;
      for (let i = digits.length - 1; i >= 0; i--) {
        let digit = parseInt(digits[i], 10);
        if (isEven) {
          digit *= 2;
          if (digit > 9) digit -= 9;
        }
        sum += digit;
        isEven = !isEven;
      }
      return sum % 10 === 0;
    },
  },
  {
    type: "DATE",
    // Matches dates in various formats: MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD, Month DD YYYY, etc.
    pattern:
      /\b(?:\d{1,2}[-\/\.]\d{1,2}[-\/\.]\d{2,4}|\d{4}[-\/\.]\d{1,2}[-\/\.]\d{1,2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4})\b/gi,
  },
  {
    type: "EMPLOYEE_ID",
    // Matches various ID formats: EMP-XXXX-XXXX, ID-XXXX, USR-XXXX, etc.
    pattern: /\b(?:[A-Z]{2,4}[-_])?(?:\d{4,}[-_]\d{4,}|\d{6,}|\d{4,})\b/g,
  },

  // ===== Database & Connection Strings =====
  {
    type: "DATABASE_URL",
    // PostgreSQL, MySQL, MongoDB, Redis connection strings
    pattern: /(?:postgres(?:ql)?|mysql|mongodb|redis):\/\/[^\s]+/gi,
  },
  {
    type: "DATABASE_PASSWORD",
    // Passwords in connection strings: user:PASSWORD@host
    pattern: /(?:\/\/|:)[a-zA-Z0-9_-]+:([^@\s]{6,})@/g,
  },

  // ===== API Keys - Specific Providers =====
  {
    type: "OPENAI_API_KEY",
    // OpenAI keys: sk-... or sk-proj-...
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9]{20,}/g,
  },
  {
    type: "AWS_ACCESS_KEY",
    // AWS Access Key IDs: AKIA...
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  },
  {
    type: "AWS_SECRET_KEY",
    // AWS Secret Access Keys: 40 char base64
    pattern: /\b[A-Za-z0-9/+=]{40}\b/g,
  },
  {
    type: "GOOGLE_API_KEY",
    // Google API keys: AIza...
    pattern: /\bAIza[A-Za-z0-9_-]{35}\b/g,
  },
  {
    type: "GITHUB_TOKEN",
    // GitHub tokens: ghp_, gho_, ghs_, ghu_
    pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g,
  },
  {
    type: "SLACK_TOKEN",
    // Slack tokens: xox[baprs]-...
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    type: "STRIPE_KEY",
    // Stripe keys: sk_live_, pk_live_, rk_live_
    pattern: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{24,}\b/g,
  },

  // ===== Generic Secrets =====
  {
    type: "JWT_TOKEN",
    // JWT tokens: eyJ... (base64 header)
    pattern: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  },
  {
    type: "BEARER_TOKEN",
    // Bearer tokens in Authorization headers
    pattern: /\b[Bb]earer\s+[A-Za-z0-9_\-\.=]+/g,
  },
  {
    type: "API_KEY_GENERIC",
    // Generic API keys: long alphanumeric strings (32+ chars)
    pattern: /\b[A-Za-z0-9_-]{32,}\b/g,
  },
  {
    type: "PRIVATE_KEY",
    // Private keys: -----BEGIN ... PRIVATE KEY-----
    pattern: /-----BEGIN[A-Z\s]+PRIVATE KEY-----[\s\S]*?-----END[A-Z\s]+PRIVATE KEY-----/g,
  },
  {
    type: "ENV_SECRET",
    // Environment variable secrets: KEY=value format
    pattern:
      /(?:SECRET|KEY|TOKEN|PASSWORD|PASS|PWD|AUTH|CREDENTIAL|API_KEY|ACCESS_KEY|SERVICE_ROLE_KEY|ANON_KEY|CLIENT_SECRET|JWT_SECRET)[\s]*[=:][\s]*['""]?([A-Za-z0-9_\-\.\/\+]{8,})['""]?/gi,
  },
  {
    type: "PASSWORD_IN_URL",
    // Passwords in URLs: http://user:PASS@host
    pattern: /(?:https?|ftp):\/\/[^\s:]+:([^\s@]{6,})@[^\s]+/gi,
  },
  {
    type: "SUPABASE_URL",
    // Supabase project URLs (contain project IDs)
    pattern: /https:\/\/[a-z0-9]+\.supabase\.co/gi,
  },
];

/**
 * PII Redaction Service
 *
 * Uses Tesseract.js for local OCR + regex-based PII detection.
 * All processing happens on-device - no external API calls.
 *
 * Caching: Results are cached by screenshot hash (SHA-256) with 1-hour TTL
 * to reduce OCR processing time.
 */
class PIIRedactionService {
  private ocrWorkers: Worker[] = [];
  private cache: NodeCache;
  private isInitializing: boolean = false;

  constructor() {
    // Initialize cache (always safe)
    this.cache = new NodeCache({
      stdTTL: 3600, // 1 hour
      maxKeys: 100,
      checkperiod: 600, // Check for expired entries every 10 minutes
    });

    // Don't initialize OCR worker in constructor
    // This allows tests to import without blocking
  }

  /**
   * Initialize Tesseract.js worker pool (5 workers for parallel OCR)
   * Workers are reused across all screenshots for maximum performance
   * Called on backend startup for instant-ready performance
   */
  async initializeOCRWorkers(): Promise<void> {
    if (this.ocrWorkers.length > 0) {
      return; // Already initialized
    }

    if (this.isInitializing) {
      // Wait for ongoing initialization
      while (this.isInitializing) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return;
    }

    try {
      this.isInitializing = true;
      console.log("[PIIRedactionService] Initializing 5 Tesseract.js workers for parallel OCR...");

      // Create 5 workers in parallel (one per OCR pass)
      const workerPromises = Array(5)
        .fill(null)
        .map(async () => {
          const worker = await createWorker("eng", 1, {
            logger: (m) => {
              if (m.status === "recognizing text") {
                // Suppress progress logs to avoid spam from 5 workers
              }
            },
          });

          // Configure Tesseract for UI text (crisp fonts, HDR-friendly)
          await (worker as any).setParameters?.({
            tessedit_pageseg_mode: "3", // Full auto page segmentation
            preserve_interword_spaces: "1", // Keep spaces between words
            user_defined_dpi: "300", // Higher DPI for better heuristics
            tessedit_do_invert: "1", // Auto-invert when needed (dark UIs)
          });

          return worker;
        });

      this.ocrWorkers = await Promise.all(workerPromises);
      console.log("[PIIRedactionService] 5 parallel OCR workers initialized and ready");
    } catch (error) {
      console.error("[PIIRedactionService] Failed to initialize OCR workers:", error);
      throw new Error("Failed to initialize OCR workers", { cause: error });
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * HDR-safe preprocessing for OCR
   * Handles washed highlights, crushed shadows, wide color gamut
   */
  private async preprocessForOCR(
    input: Buffer
  ): Promise<{ prepped: Buffer; inverted: Buffer; looksBlownOut: boolean }> {
    // 1) Force sRGB (avoids wide-gamut/HDR weirdness)
    let img = sharp(input, { unlimited: true }).toColourspace("srgb").removeAlpha();

    // 2) Get luminance stats to detect HDR-ish frames
    const stats = await img.stats();
    const mean = stats.channels[0].mean / 255; // R as proxy (sRGB)
    const std = stats.channels[0].stdev / 255;

    // 3) Tone mapping for "washed" HDR screenshots
    //    If very bright or very flat, compress highlights & boost local contrast
    const looksBlownOut = mean > 0.7 || std < 0.06;

    console.log(
      `[HDR Preprocess] mean=${mean.toFixed(3)}, std=${std.toFixed(3)}, looksBlownOut=${looksBlownOut}`
    );

    img = img
      .gamma(looksBlownOut ? 1.6 : 1.2) // >1 darkens highlights / lifts mids
      .linear(1.1, -10) // slight contrast bump
      .modulate({ saturation: 0 }) // ensure true grayscale
      .greyscale()
      .normalize(); // stretch to full range

    // Apply median filter only for HDR (median requires value >= 1)
    if (looksBlownOut) {
      img = img.median(1); // light de-speckle
    }

    // 4) Adaptive-ish threshold via blur/image trick
    const blurred = await img
      .clone()
      .blur(looksBlownOut ? 3.0 : 2.0)
      .toBuffer();
    const prepped = await sharp(await img.toBuffer())
      .linear(1, 0) // identity
      .joinChannel(blurred) // [gray, blurred]
      .toColorspace("b-w") // keeps single channel ops stable
      .threshold(looksBlownOut ? 170 : 150) // global fallback threshold
      .toBuffer();

    // 5) Edge case: dark-UI → run an inverted pass too
    const inverted = await sharp(prepped).negate().toBuffer();

    return { prepped, inverted, looksBlownOut };
  }

  /**
   * Combine adjacent words on the same line
   * Helps catch emails/URLs split by OCR (e.g., "user@domain." + "com" → "user@domain.com")
   */
  private combineAdjacentWords(
    words: Array<{
      text: string;
      bbox: { x0: number; y0: number; x1: number; y1: number };
      confidence: number;
    }>
  ): Array<{
    text: string;
    bbox: { x0: number; y0: number; x1: number; y1: number };
    confidence: number;
  }> {
    if (words.length === 0) return words;

    // Sort by Y position (top to bottom), then X position (left to right)
    const sorted = [...words].sort((a, b) => {
      const yDiff = a.bbox.y0 - b.bbox.y0;
      if (Math.abs(yDiff) < 10) {
        // Same line (within 10px)
        return a.bbox.x0 - b.bbox.x0;
      }
      return yDiff;
    });

    const combined: Array<{
      text: string;
      bbox: { x0: number; y0: number; x1: number; y1: number };
      confidence: number;
    }> = [];
    let current = sorted[0];

    for (let i = 0; i < sorted.length - 1; i++) {
      const next = sorted[i + 1];
      const isOnSameLine = Math.abs(current.bbox.y0 - next.bbox.y0) < 10;
      const isClose = next.bbox.x0 - current.bbox.x1 < 30; // Within 30px horizontally
      const isModeratelyClose = next.bbox.x0 - current.bbox.x1 < 150; // Within 150px (for credit cards on visual cards)

      // Check if current and next might be parts of credit card (4-digit groups)
      const mightBeCreditCard = /^\d{4}$/.test(current.text) && /^\d{4}$/.test(next.text);

      if (isOnSameLine && (isClose || (isModeratelyClose && mightBeCreditCard))) {
        // Merge words with space (helps email/URL/credit card matching)
        current = {
          text: current.text + " " + next.text,
          bbox: {
            x0: current.bbox.x0,
            y0: Math.min(current.bbox.y0, next.bbox.y0),
            x1: next.bbox.x1,
            y1: Math.max(current.bbox.y1, next.bbox.y1),
          },
          confidence: Math.min(current.confidence, next.confidence),
        };
      } else {
        combined.push(current);
        current = next;
      }
    }
    combined.push(current);

    return combined;
  }

  /**
   * Deduplicate overlapping PII regions from multiple OCR passes
   * If two regions overlap significantly (>30% IoU), merge them
   */
  private deduplicatePIIRegions(
    piiMatches: Array<{
      type: string;
      text: string;
      bbox: { x0: number; y0: number; x1: number; y1: number };
    }>
  ): Array<{
    type: string;
    text: string;
    bbox: { x0: number; y0: number; x1: number; y1: number };
  }> {
    if (piiMatches.length === 0) return [];

    // Calculate IoU (Intersection over Union) between two bounding boxes
    const calculateIoU = (
      box1: { x0: number; y0: number; x1: number; y1: number },
      box2: { x0: number; y0: number; x1: number; y1: number }
    ): number => {
      const x0 = Math.max(box1.x0, box2.x0);
      const y0 = Math.max(box1.y0, box2.y0);
      const x1 = Math.min(box1.x1, box2.x1);
      const y1 = Math.min(box1.y1, box2.y1);

      if (x1 < x0 || y1 < y0) return 0; // No overlap

      const intersection = (x1 - x0) * (y1 - y0);
      const area1 = (box1.x1 - box1.x0) * (box1.y1 - box1.y0);
      const area2 = (box2.x1 - box2.x0) * (box2.y1 - box2.y0);
      const union = area1 + area2 - intersection;

      return intersection / union;
    };

    const deduplicated: typeof piiMatches = [];
    const used = new Set<number>();

    for (let i = 0; i < piiMatches.length; i++) {
      if (used.has(i)) continue;

      const current = piiMatches[i];
      let merged = { ...current };

      // Check for overlaps with remaining matches
      for (let j = i + 1; j < piiMatches.length; j++) {
        if (used.has(j)) continue;

        const other = piiMatches[j];
        const iou = calculateIoU(current.bbox, other.bbox);

        // If significant overlap (>30% IoU), merge them
        if (iou > 0.3) {
          // Expand bounding box to cover both
          merged.bbox = {
            x0: Math.min(merged.bbox.x0, other.bbox.x0),
            y0: Math.min(merged.bbox.y0, other.bbox.y0),
            x1: Math.max(merged.bbox.x1, other.bbox.x1),
            y1: Math.max(merged.bbox.y1, other.bbox.y1),
          };
          used.add(j);
        }
      }

      deduplicated.push(merged);
      used.add(i);
    }

    return deduplicated;
  }

  /**
   * Detect PII in OCR text using regex patterns
   */
  private detectPII(
    words: Array<{
      text: string;
      bbox: { x0: number; y0: number; x1: number; y1: number };
      confidence: number;
    }>
  ): Array<{
    type: string;
    bbox: { x0: number; y0: number; x1: number; y1: number };
    text: string;
  }> {
    // First, combine adjacent words to catch split emails/URLs/credit cards
    const combinedWords = this.combineAdjacentWords(words);

    console.log(
      `[PII Detection] Combined ${words.length} words → ${combinedWords.length} combined words`
    );
    console.log(
      `[PII Detection] 🔗 First 30 combined:`,
      combinedWords.slice(0, 30).map((w) => w.text)
    );

    const matches: Array<{ type: string; bbox: any; text: string }> = [];

    for (const word of combinedWords) {
      for (const pattern of PII_PATTERNS) {
        const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);
        const match = word.text.match(regex);

        if (match) {
          // Apply validator if present
          if (pattern.validator && !pattern.validator(word.text)) {
            console.log(
              `[PII Detection] ❌ Pattern matched but validation failed: [${pattern.type}] "${word.text}"`
            );
            continue;
          }

          console.log(`[PII Detection] ✅ Match found: [${pattern.type}] "${word.text}"`);
          matches.push({
            type: pattern.type,
            bbox: word.bbox,
            text: word.text,
          });
          break; // One PII type per word
        }
      }
    }

    return matches;
  }

  /**
   * Redact PII from screenshot using Tesseract.js OCR + local detection
   *
   * @param request - Screenshot as base64 data URL
   * @returns Fully redacted screenshot with black rectangles over PII
   */
  async redactScreenshot(request: PIIDetectionRequest): Promise<PIIDetectionResponse> {
    const startTime = Date.now();

    try {
      // Ensure Tesseract.js worker pool is initialized
      await this.initializeOCRWorkers();

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

      console.log("[PIIRedactionService] Cache MISS - running OCR...");

      // Parse base64 data URL
      const base64Data = this.extractBase64Data(request.screenshot);
      const imageBuffer = Buffer.from(base64Data, "base64");

      // Get image dimensions
      const imageMetadata = await sharp(imageBuffer).metadata();
      const originalWidth = imageMetadata.width || 1920;
      const originalHeight = imageMetadata.height || 1080;

      // HDR-safe preprocessing for OCR
      console.log("[PIIRedactionService] Preprocessing image for OCR (HDR-safe)...");
      const { prepped, inverted, looksBlownOut } = await this.preprocessForOCR(imageBuffer);
      console.log(`[PIIRedactionService] HDR detection: looksBlownOut = ${looksBlownOut}`);

      // ========================================
      // PARALLEL OCR - Prepare all buffers first (Sharp is fast ~50ms each)
      // ========================================
      console.log("[PIIRedactionService] 🚀 Preparing image buffers for parallel OCR...");

      const simplePrep = await sharp(imageBuffer)
        .greyscale()
        .normalize()
        .sharpen()
        .png()
        .toBuffer();

      const aggressiveContrast = await sharp(imageBuffer)
        .greyscale()
        .normalize()
        .linear(1.5, -50) // Boost contrast hard
        .threshold(140) // Binary threshold - only black or white
        .png()
        .toBuffer();

      const upscaled = await sharp(imageBuffer)
        .resize(Math.round(originalWidth * 2), Math.round(originalHeight * 2), {
          kernel: "lanczos3", // High-quality upscaling
        })
        .greyscale()
        .normalize()
        .sharpen()
        .png()
        .toBuffer();

      console.log(
        `[PIIRedactionService] ⚡ Running ${looksBlownOut ? 5 : 3} OCR passes IN PARALLEL with dedicated workers...`
      );
      const ocrStartTime = Date.now();

      // Run ALL OCR passes in parallel using dedicated workers (TRUE parallelism)
      const [ocrResult1, ocrResult2, ocrResult3, ocrResult4, ocrResult5] = await Promise.all([
        this.ocrWorkers[0].recognize(simplePrep, {}, { blocks: true }), // Worker 1: Simple
        this.ocrWorkers[1].recognize(aggressiveContrast, {}, { blocks: true }), // Worker 2: Aggressive
        this.ocrWorkers[2].recognize(upscaled, {}, { blocks: true }), // Worker 3: Upscaled
        looksBlownOut
          ? this.ocrWorkers[3].recognize(prepped, {}, { blocks: true })
          : Promise.resolve(null), // Worker 4: HDR tone-mapped
        looksBlownOut
          ? this.ocrWorkers[4].recognize(inverted, {}, { blocks: true })
          : Promise.resolve(null), // Worker 5: HDR inverted
      ]);

      const ocrDuration = Date.now() - ocrStartTime;
      console.log(`[PIIRedactionService] ✅ Parallel OCR completed in ${ocrDuration}ms`);

      // Calculate average confidence for each pass (better metric than word count)
      const calcConfidence = (result: any): { avgConfidence: number; wordCount: number } => {
        const blocks = result.data.blocks || [];
        let totalConfidence = 0;
        let wordCount = 0;

        for (const block of blocks) {
          if (!block.paragraphs) continue;
          for (const paragraph of block.paragraphs) {
            if (!paragraph.lines) continue;
            for (const line of paragraph.lines) {
              if (!line.words) continue;
              for (const word of line.words) {
                totalConfidence += word.confidence || 0;
                wordCount++;
              }
            }
          }
        }

        return {
          avgConfidence: wordCount > 0 ? totalConfidence / wordCount : 0,
          wordCount,
        };
      };

      const pass1Stats = calcConfidence(ocrResult1);
      const pass2Stats = calcConfidence(ocrResult2);
      const pass3Stats = calcConfidence(ocrResult3);
      const pass4Stats = ocrResult4
        ? calcConfidence(ocrResult4)
        : { avgConfidence: 0, wordCount: 0 };
      const pass5Stats = ocrResult5
        ? calcConfidence(ocrResult5)
        : { avgConfidence: 0, wordCount: 0 };

      console.log(
        `[PIIRedactionService] Pass 1 (simple): ${pass1Stats.wordCount} words, ${pass1Stats.avgConfidence.toFixed(2)}% confidence`
      );
      console.log(
        `[PIIRedactionService] Pass 2 (aggressive contrast): ${pass2Stats.wordCount} words, ${pass2Stats.avgConfidence.toFixed(2)}% confidence`
      );
      console.log(
        `[PIIRedactionService] Pass 3 (2x upscaled): ${pass3Stats.wordCount} words, ${pass3Stats.avgConfidence.toFixed(2)}% confidence`
      );
      if (ocrResult4) {
        console.log(
          `[PIIRedactionService] Pass 4 (HDR tone-mapped): ${pass4Stats.wordCount} words, ${pass4Stats.avgConfidence.toFixed(2)}% confidence`
        );
      }
      if (ocrResult5) {
        console.log(
          `[PIIRedactionService] Pass 5 (HDR inverted): ${pass5Stats.wordCount} words, ${pass5Stats.avgConfidence.toFixed(2)}% confidence`
        );
      }

      // Extract words from all passes
      const extractWordsFromResult = (
        result: any
      ): Array<{
        text: string;
        bbox: { x0: number; y0: number; x1: number; y1: number };
        confidence: number;
      }> => {
        const words: Array<{
          text: string;
          bbox: { x0: number; y0: number; x1: number; y1: number };
          confidence: number;
        }> = [];

        const blocks = (result.data as any).blocks || [];

        for (const block of blocks) {
          if (!block.paragraphs) continue;

          for (const para of block.paragraphs) {
            if (!para.lines) continue;

            for (const line of para.lines) {
              if (!line.words) continue;

              for (const word of line.words) {
                if (word.text && word.bbox) {
                  words.push({
                    text: word.text,
                    bbox: word.bbox,
                    confidence: word.confidence || 0,
                  });
                }
              }
            }
          }
        }

        return words;
      };

      // Collect words from all passes (need to scale back coordinates from upscaled pass 3)
      const pass1Words = extractWordsFromResult(ocrResult1);
      const pass2Words = extractWordsFromResult(ocrResult2);

      // Pass 3 was 2x upscaled, so scale coordinates back to original size
      const pass3WordsRaw = extractWordsFromResult(ocrResult3);
      const pass3Words = pass3WordsRaw.map((w) => ({
        ...w,
        bbox: {
          x0: w.bbox.x0 / 2,
          y0: w.bbox.y0 / 2,
          x1: w.bbox.x1 / 2,
          y1: w.bbox.y1 / 2,
        },
      }));

      const pass4Words = ocrResult4 ? extractWordsFromResult(ocrResult4) : [];
      const pass5Words = ocrResult5 ? extractWordsFromResult(ocrResult5) : [];

      console.log(`[PIIRedactionService] 🔄 Merging detections from all passes...`);
      console.log(`[PIIRedactionService] Pass 1 extracted: ${pass1Words.length} words`);
      console.log(`[PIIRedactionService] Pass 2 extracted: ${pass2Words.length} words`);
      console.log(
        `[PIIRedactionService] Pass 3 extracted: ${pass3Words.length} words (scaled from 2x)`
      );
      if (pass4Words.length > 0)
        console.log(`[PIIRedactionService] Pass 4 extracted: ${pass4Words.length} words`);
      if (pass5Words.length > 0)
        console.log(`[PIIRedactionService] Pass 5 extracted: ${pass5Words.length} words`);

      // DEBUG: Show sample from each pass
      console.log(
        `[PIIRedactionService] 📝 Pass 1 sample:`,
        pass1Words.slice(0, 30).map((w) => w.text)
      );
      console.log(
        `[PIIRedactionService] 📝 Pass 2 sample:`,
        pass2Words.slice(0, 30).map((w) => w.text)
      );
      console.log(
        `[PIIRedactionService] 📝 Pass 3 sample:`,
        pass3Words.slice(0, 30).map((w) => w.text)
      );
      if (pass4Words.length > 0)
        console.log(
          `[PIIRedactionService] 📝 Pass 4 sample:`,
          pass4Words.slice(0, 30).map((w) => w.text)
        );
      if (pass5Words.length > 0)
        console.log(
          `[PIIRedactionService] 📝 Pass 5 sample:`,
          pass5Words.slice(0, 30).map((w) => w.text)
        );

      // Merge all words from all passes (we'll deduplicate PII regions later)
      const words = [...pass1Words, ...pass2Words, ...pass3Words, ...pass4Words, ...pass5Words];

      console.log(`[PIIRedactionService] 📊 Total words from all passes: ${words.length}`);

      if (words.length === 0) {
        console.log("[PIIRedactionService] No words extracted from OCR");
        const metadata = {
          originalWidth,
          originalHeight,
          processedWidth: originalWidth,
          processedHeight: originalHeight,
        };

        this.cache.set(cacheKey, { redactedScreenshot: request.screenshot, metadata, piiCount: 0 });

        return {
          success: true,
          redactedScreenshot: request.screenshot,
          detectionTime: Date.now() - startTime,
          piiCount: 0,
          metadata,
          cached: false,
        };
      }

      // Debug: Log first 50 words to see what OCR is reading
      console.log(
        "[PIIRedactionService] 🔍 First 50 merged words:",
        words.slice(0, 50).map((w) => w.text)
      );

      // Detect PII in extracted text (this does word combining internally)
      const allPiiMatches = this.detectPII(words);
      console.log(
        `[PIIRedactionService] Detected ${allPiiMatches.length} PII instances (before deduplication)`
      );

      // DEBUG: Show what was detected
      if (allPiiMatches.length > 0) {
        console.log(`[PIIRedactionService] 🎯 Detected PII details:`);
        allPiiMatches.forEach((match, idx) => {
          console.log(`  ${idx + 1}. [${match.type}] "${match.text}"`);
        });
      }

      // Deduplicate overlapping PII regions from multiple passes
      const piiMatches = this.deduplicatePIIRegions(allPiiMatches);
      console.log(
        `[PIIRedactionService] After deduplication: ${piiMatches.length} unique PII instances`
      );

      if (piiMatches.length > 0) {
        console.log(
          "[PIIRedactionService] PII types found:",
          piiMatches.map((m: { type: string }) => m.type)
        );
      }

      // If no PII detected, return original
      if (piiMatches.length === 0) {
        const metadata = {
          originalWidth,
          originalHeight,
          processedWidth: originalWidth,
          processedHeight: originalHeight,
        };

        this.cache.set(cacheKey, { redactedScreenshot: request.screenshot, metadata, piiCount: 0 });

        return {
          success: true,
          redactedScreenshot: request.screenshot,
          detectionTime: Date.now() - startTime,
          piiCount: 0,
          metadata,
          cached: false,
        };
      }

      // Create black box overlays for PII regions
      const svgOverlay = this.createRedactionOverlay(piiMatches, originalWidth, originalHeight);

      // Composite overlay onto image
      const redactedBuffer = await sharp(imageBuffer)
        .composite([
          {
            input: Buffer.from(svgOverlay),
            top: 0,
            left: 0,
          },
        ])
        .png()
        .toBuffer();

      // Convert back to base64 data URL
      const redactedBase64 = redactedBuffer.toString("base64");
      const redactedScreenshot = `data:image/png;base64,${redactedBase64}`;

      const metadata = {
        originalWidth,
        originalHeight,
        processedWidth: originalWidth,
        processedHeight: originalHeight,
      };

      // Store in cache
      this.cache.set(cacheKey, { redactedScreenshot, metadata, piiCount: piiMatches.length });

      const detectionTime = Date.now() - startTime;

      console.log(
        `[PIIRedactionService] Redaction complete: ${detectionTime}ms, ` +
          `PII regions: ${piiMatches.length}, cached: false`
      );

      return {
        success: true,
        redactedScreenshot,
        detectionTime,
        piiCount: piiMatches.length,
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
        metadata: {
          originalWidth: 0,
          originalHeight: 0,
          processedWidth: 0,
          processedHeight: 0,
        },
        cached: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Create SVG overlay with black rectangles for PII regions
   * Adds padding to handle OCR jitter
   */
  private createRedactionOverlay(
    matches: Array<{ bbox: { x0: number; y0: number; x1: number; y1: number } }>,
    width: number,
    height: number
  ): string {
    // Add 5px padding to each box for OCR jitter tolerance
    const padding = 5;

    const rects = matches.map((match) => {
      const x0 = Math.max(0, match.bbox.x0 - padding);
      const y0 = Math.max(0, match.bbox.y0 - padding);
      const x1 = Math.min(width, match.bbox.x1 + padding);
      const y1 = Math.min(height, match.bbox.y1 + padding);

      const rectWidth = x1 - x0;
      const rectHeight = y1 - y0;

      return `<rect x="${x0}" y="${y0}" width="${rectWidth}" height="${rectHeight}" fill="black" />`;
    });

    return `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        ${rects.join("\n")}
      </svg>
    `;
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

  /**
   * Cleanup: Terminate all OCR workers
   */
  async terminate(): Promise<void> {
    if (this.ocrWorkers.length > 0) {
      console.log("[PIIRedactionService] Terminating 5 OCR workers...");
      await Promise.all(this.ocrWorkers.map((worker) => worker.terminate()));
      this.ocrWorkers = [];
      console.log("[PIIRedactionService] All OCR workers terminated");
    }
  }
}

// Export singleton instance
export const piiRedactionService = new PIIRedactionService();
