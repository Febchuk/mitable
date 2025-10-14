import type { PineconeMatch } from "../shared-types/pinecone.types";
import type { IntentAnalysis } from "../shared-types/intent.types";
import { INTENT_TRUST_MAP, TRUST_CONFIDENCE_THRESHOLD } from "../shared-types/trust.types";

/**
 * Determine source type from metadata
 */
function getSourceType(metadata: Record<string, any>): "codebase" | "document" | "chat" {
  // Future: Check for codebase sources
  if (metadata.source === 'github' || metadata.repository) {
    return "codebase";
  }
  
  // Check for document sources
  if (
    metadata.source === 'google-drive' ||
    metadata.source === 'notion' ||
    metadata.fileType === 'PDF' ||
    metadata.fileType === 'Google Docs' ||
    metadata.pageType // Notion pages
  ) {
    return "document";
  }
  
  // Default to chat (Slack, etc.)
  return "chat";
}

/**
 * Apply trust-based ranking to Pinecone matches based on intent
 */
export function applyTrustRanking(
  matches: PineconeMatch[],
  intent: IntentAnalysis,
  hasDateFilter: boolean = false
): PineconeMatch[] {
  // Skip ranking for date-based queries (want all sources equally)
  if (hasDateFilter) {
    console.log("Date filter detected, skipping trust ranking (showing all sources equally)");
    return [...matches].sort((a, b) => (b.score || 0) - (a.score || 0));
  }
  
  // Skip ranking if confidence is too low or intent doesn't need it
  const trustConfig = INTENT_TRUST_MAP[intent.type];
  
  if (!trustConfig || intent.confidence < TRUST_CONFIDENCE_THRESHOLD) {
    console.log(`Skipping trust ranking (confidence: ${intent.confidence}, threshold: ${TRUST_CONFIDENCE_THRESHOLD})`);
    // Return sorted by original score
    return [...matches].sort((a, b) => (b.score || 0) - (a.score || 0));
  }
  
  console.log(`Applying trust ranking for intent: ${intent.type}`);
  console.log(`Multipliers - codebase: ${trustConfig.multipliers.codebase}x, document: ${trustConfig.multipliers.document}x, chat: ${trustConfig.multipliers.chat}x`);
  
  // Apply trust multipliers
  const rankedMatches = matches.map(match => {
    const metadata = match.metadata || {};
    const sourceType = getSourceType(metadata);
    const multiplier = trustConfig.multipliers[sourceType];
    const adjustedScore = (match.score || 0) * multiplier;
    
    return {
      ...match,
      originalScore: match.score,
      adjustedScore,
      sourceType,
      multiplier
    };
  });
  
  // Sort by adjusted score
  rankedMatches.sort((a, b) => (b.adjustedScore || 0) - (a.adjustedScore || 0));
  
  // Log top 5 for debugging
  console.log("Top 5 after trust ranking:");
  rankedMatches.slice(0, 5).forEach((match, i) => {
    console.log(`  ${i + 1}. [${match.sourceType}] score: ${match.originalScore?.toFixed(3)} × ${match.multiplier}x = ${match.adjustedScore?.toFixed(3)}`);
  });
  
  return rankedMatches;
}
