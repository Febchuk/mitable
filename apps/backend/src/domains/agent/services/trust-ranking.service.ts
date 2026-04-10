import type { IntentAnalysis, SourceType, TrustConfig } from "../../../types/trust.types.js";
import { INTENT_TRUST_MAP, TRUST_CONFIDENCE_THRESHOLD } from "../../../types/trust.types.js";
import type { QueryResult } from "../../shared-infra/services/vector.service.js";

/**
 * Extended QueryResult with trust ranking metadata
 */
export interface RankedResult extends QueryResult {
  originalScore?: number;
  adjustedScore?: number;
  sourceType?: SourceType;
  multiplier?: number;
}

/**
 * Trust-Based Ranking Service
 *
 * Applies intelligent result ranking based on query intent and source type.
 * Boosts relevant sources for different query types:
 * - Company questions → Boost Notion/Google Drive
 * - Product questions → Boost PRDs/specs
 * - Operations questions → Boost Slack
 * - Technical questions → Boost codebase + docs
 */
class TrustRankingService {
  /**
   * Determine source type from vector metadata
   */
  private getSourceType(metadata: Record<string, any>): SourceType {
    // Check for codebase sources (future: GitHub integration)
    if (metadata.source === "github" || metadata.repository) {
      return "codebase";
    }

    // Check for document sources
    if (
      metadata.source === "google-drive" ||
      metadata.source === "notion" ||
      metadata.fileType === "PDF" ||
      metadata.fileType === "Google Docs" ||
      metadata.pageType || // Notion pages
      metadata.page_id // Notion blocks
    ) {
      return "document";
    }

    // Default to chat (Slack, etc.)
    return "chat";
  }

  /**
   * Check if query contains date/time filters
   */
  private hasDateFilter(query: string): boolean {
    const datePatterns = [
      /last (week|month|year|quarter|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
      /this (week|month|year|quarter)/i,
      /yesterday|today|tomorrow/i,
      /(january|february|march|april|may|june|july|august|september|october|november|december)/i,
      /\d{1,2}\/\d{1,2}(\/\d{2,4})?/i, // Date formats like 10/18/2024
      /\d{4}-\d{2}-\d{2}/i, // ISO dates like 2024-10-18
      /what happened|when did|timeline|when was|recently|latest/i,
      /in (january|february|march|april|may|june|july|august|september|october|november|december)/i,
      /(past|previous|next) (week|month|year)/i,
      /\d+ (days?|weeks?|months?|years?) ago/i, // "5 days ago"
    ];

    return datePatterns.some((pattern) => pattern.test(query));
  }

  /**
   * Check if query contains keywords that match document title
   */
  private hasKeywordMatch(query: string, title: string): boolean {
    const queryLower = query.toLowerCase();
    const titleLower = title.toLowerCase();

    // Extract important keywords from query
    const keywords = queryLower.match(
      /\b(prd|prds|product requirements?|roadmap|spec|specification|business model|onboarding|guide|documentation?)\b/gi
    );

    if (!keywords) return false;

    // Check if any keyword appears in title
    return keywords.some((keyword) => titleLower.includes(keyword.toLowerCase()));
  }

  /**
   * Apply trust-based ranking to search results
   *
   * @param results - Raw vector search results
   * @param intent - Detected user intent
   * @param query - Original user query (for date detection and keyword matching)
   * @returns Ranked results with boosted scores
   */
  applyTrustRanking(results: QueryResult[], intent: IntentAnalysis, query: string): RankedResult[] {
    // Check if this is a date-based query
    const isDateQuery = this.hasDateFilter(query);

    if (isDateQuery) {
      console.log(
        "[TrustRanking] Date filter detected - will apply intent-based ranking but skip keyword matching"
      );
    }

    // Skip ranking if confidence is too low or no trust config
    const trustConfig: TrustConfig | undefined = INTENT_TRUST_MAP[intent.type];

    if (!trustConfig || intent.confidence < TRUST_CONFIDENCE_THRESHOLD) {
      console.log(
        `[TrustRanking] Skipping trust ranking (confidence: ${intent.confidence}, threshold: ${TRUST_CONFIDENCE_THRESHOLD})`
      );
      // Return sorted by original score
      return [...results].sort((a, b) => (b.score || 0) - (a.score || 0));
    }

    console.log(`[TrustRanking] Applying trust ranking for intent: ${intent.type}`);
    console.log(
      `[TrustRanking] Multipliers - codebase: ${trustConfig.multipliers.codebase}x, document: ${trustConfig.multipliers.document}x, chat: ${trustConfig.multipliers.chat}x`
    );

    // Apply trust multipliers + keyword matching boost (skip keyword boost for date queries)
    const rankedResults: RankedResult[] = results.map((result) => {
      const metadata = result.metadata || {};
      const sourceType = this.getSourceType(metadata);
      let multiplier = trustConfig.multipliers[sourceType];

      // Apply additional boost for keyword matches in title (SKIP for date queries)
      if (!isDateQuery) {
        const title = metadata.title || metadata.page_title || metadata.channel_name || "";
        const hasKeywordBoost = this.hasKeywordMatch(query, title);

        if (hasKeywordBoost) {
          multiplier *= 2.0; // 2x boost for keyword match (e.g., "PRD" in title)
          console.log(`[TrustRanking] Keyword match boost applied to: ${title}`);
        }
      }

      // Apply massive boost when query explicitly mentions source type
      const queryLower = query.toLowerCase();
      const source = (metadata.source || "").toLowerCase();
      if (
        (queryLower.includes("notion") && source === "notion") ||
        (queryLower.includes("slack") && source === "slack") ||
        (queryLower.includes("github") && source === "github") ||
        (queryLower.includes("google drive") && source === "google-drive")
      ) {
        multiplier *= 5.0; // 5x boost when user explicitly asks for a specific source
        console.log(`[TrustRanking] Source type match boost applied: user asked for ${source}`);
      }

      const adjustedScore = (result.score || 0) * multiplier;

      return {
        ...result,
        originalScore: result.score,
        adjustedScore,
        sourceType,
        multiplier,
      };
    });

    // Sort by adjusted score
    rankedResults.sort((a, b) => (b.adjustedScore || 0) - (a.adjustedScore || 0));

    // Log top 5 for debugging
    console.log("[TrustRanking] Top 5 after trust ranking:");
    rankedResults.slice(0, 5).forEach((result, i) => {
      const source = result.metadata?.source || "unknown";
      console.log(
        `  ${i + 1}. [${result.sourceType}/${source}] score: ${result.originalScore?.toFixed(3)} × ${result.multiplier}x = ${result.adjustedScore?.toFixed(3)}`
      );
    });

    return rankedResults;
  }
}

// Export singleton instance
export const trustRankingService = new TrustRankingService();
