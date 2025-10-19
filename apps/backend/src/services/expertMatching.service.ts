import { db } from "../db/client";
import { expertProfiles, expertTopics, users } from "../db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { embeddingService } from "./embedding.service";

/**
 * Expert match result
 */
export interface ExpertMatch {
  userId: string;
  name: string;
  email: string;
  role?: string;
  department?: string;
  avatarUrl?: string;
  matchScore: number;
  matchReasons: string[];
  expertise: {
    summary: string;
    topics: string[];
  };
  performance: {
    responseRate: number;
    helpfulnessScore: number;
    avgResponseTime: string | null;
    totalInteractions: number;
  };
  availability: "available" | "away" | "busy" | "offline";
}

/**
 * Expert Matching Service
 *
 * Implements the expert matching algorithm:
 * - Expertise similarity (40%) - cosine similarity of topic embeddings
 * - Performance (30%) - response rate + helpfulness rating
 * - Availability (30%) - current status (from user metadata)
 *
 * Returns ranked list of experts best suited to help with a query.
 */
class ExpertMatchingService {
  /**
   * Find best matching experts for a query
   *
   * @param query - User's question or topic
   * @param organizationId - Organization to search within
   * @param topK - Number of experts to return (default: 3)
   * @returns Ranked list of expert matches
   */
  async findExperts(
    query: string,
    organizationId: string,
    topK: number = 3
  ): Promise<ExpertMatch[]> {
    console.log(`[ExpertMatchingService] Finding experts for: "${query}"`);

    try {
      // Step 1: Get all expert profiles in the organization
      const expertsData = await db
        .select({
          userId: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          department: users.department,
          avatarUrl: users.avatarUrl,
          status: users.status,
          organizationId: users.organizationId,
          expertiseSummary: expertProfiles.expertiseSummary,
          responseRate: expertProfiles.responseRate,
          helpfulnessScore: expertProfiles.helpfulnessScore,
          avgResponseTime: expertProfiles.avgResponseTime,
          totalInteractions: expertProfiles.totalInteractions,
        })
        .from(users)
        .innerJoin(expertProfiles, eq(users.id, expertProfiles.userId))
        .where(eq(users.organizationId, organizationId));

      if (expertsData.length === 0) {
        console.log("[ExpertMatchingService] No experts found in organization");
        return [];
      }

      console.log(`[ExpertMatchingService] Found ${expertsData.length} experts`);

      // Step 2: Get all expert topics for expertise similarity
      const allTopics = await db
        .select()
        .from(expertTopics)
        .where(
          sql`${expertTopics.userId} IN (${sql.join(
            expertsData.map((e) => sql`${e.userId}`),
            sql`, `
          )})`
        );

      // Group topics by user
      const topicsByUser = new Map<string, typeof allTopics>();
      for (const topic of allTopics) {
        const existing = topicsByUser.get(topic.userId) || [];
        topicsByUser.set(topic.userId, [...existing, topic]);
      }

      // Step 3: Embed the query for semantic similarity
      const queryEmbedding = await embeddingService.embedText(query);

      // Step 4: Calculate scores for each expert
      const matches: ExpertMatch[] = [];

      for (const expert of expertsData) {
        const topics = topicsByUser.get(expert.userId) || [];

        // Calculate expertise similarity (40%)
        const expertiseSimilarity = await this.calculateExpertiseSimilarity(
          queryEmbedding,
          topics.map((t) => t.topic)
        );

        // Calculate performance score (30%)
        const performanceScore = this.calculatePerformanceScore(
          parseFloat(expert.responseRate || "0"),
          parseFloat(expert.helpfulnessScore || "0")
        );

        // Calculate availability score (30%)
        const availabilityScore = this.calculateAvailabilityScore(
          expert.status as string
        );

        // Weighted final score
        const matchScore =
          expertiseSimilarity * 0.4 +
          performanceScore * 0.3 +
          availabilityScore * 0.3;

        // Generate match reasons
        const matchReasons = this.generateMatchReasons(
          expertiseSimilarity,
          performanceScore,
          availabilityScore,
          topics.map((t) => t.topic)
        );

        matches.push({
          userId: expert.userId,
          name: expert.name,
          email: expert.email,
          role: expert.role || undefined,
          department: expert.department || undefined,
          avatarUrl: expert.avatarUrl || undefined,
          matchScore: Math.round(matchScore * 100) / 100,
          matchReasons,
          expertise: {
            summary: expert.expertiseSummary || "",
            topics: topics.map((t) => t.topic),
          },
          performance: {
            responseRate: parseFloat(expert.responseRate || "0"),
            helpfulnessScore: parseFloat(expert.helpfulnessScore || "0"),
            avgResponseTime: expert.avgResponseTime,
            totalInteractions: expert.totalInteractions || 0,
          },
          availability: this.mapAvailability(expert.status as string),
        });
      }

      // Step 5: Sort by match score and return top K
      matches.sort((a, b) => b.matchScore - a.matchScore);
      return matches.slice(0, topK);
    } catch (error) {
      console.error("[ExpertMatchingService] Error finding experts:", error);
      throw error;
    }
  }

  /**
   * Calculate expertise similarity using semantic embeddings
   * Returns score from 0 to 1
   */
  private async calculateExpertiseSimilarity(
    queryEmbedding: number[],
    expertTopics: string[]
  ): Promise<number> {
    if (expertTopics.length === 0) return 0;

    // Embed all expert topics
    const topicEmbeddings = await embeddingService.embedTexts(expertTopics);

    // Calculate cosine similarity with each topic and take the max
    const similarities = topicEmbeddings.map((topicEmb) =>
      this.cosineSimilarity(queryEmbedding, topicEmb)
    );

    return Math.max(...similarities);
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));

    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Calculate performance score (0 to 1)
   * Based on response rate (0-100%) and helpfulness (0-5)
   */
  private calculatePerformanceScore(
    responseRate: number,
    helpfulnessScore: number
  ): number {
    const normalizedResponseRate = responseRate / 100; // 0-1
    const normalizedHelpfulness = helpfulnessScore / 5; // 0-1

    return (normalizedResponseRate + normalizedHelpfulness) / 2;
  }

  /**
   * Calculate availability score (0 to 1)
   * available = 1.0, away = 0.7, busy = 0.4, offline = 0.1
   */
  private calculateAvailabilityScore(status: string): number {
    const statusMap: Record<string, number> = {
      available: 1.0,
      away: 0.7,
      busy: 0.4,
      offline: 0.1,
    };

    return statusMap[status] || 0.5; // Default to 0.5 if unknown
  }

  /**
   * Map status string to availability enum
   */
  private mapAvailability(
    status: string
  ): "available" | "away" | "busy" | "offline" {
    if (["available", "away", "busy", "offline"].includes(status)) {
      return status as "available" | "away" | "busy" | "offline";
    }
    return "offline";
  }

  /**
   * Generate human-readable match reasons
   */
  private generateMatchReasons(
    expertiseSimilarity: number,
    performanceScore: number,
    availabilityScore: number,
    topics: string[]
  ): string[] {
    const reasons: string[] = [];

    // Expertise reasons
    if (expertiseSimilarity > 0.8) {
      reasons.push(`Highly relevant expertise in: ${topics.slice(0, 3).join(", ")}`);
    } else if (expertiseSimilarity > 0.6) {
      reasons.push(`Relevant experience with: ${topics.slice(0, 2).join(", ")}`);
    }

    // Performance reasons
    if (performanceScore > 0.8) {
      reasons.push("Excellent response rate and helpfulness ratings");
    } else if (performanceScore > 0.6) {
      reasons.push("Good track record of helping colleagues");
    }

    // Availability reasons
    if (availabilityScore === 1.0) {
      reasons.push("Currently available");
    } else if (availabilityScore >= 0.7) {
      reasons.push("Likely to respond soon");
    }

    return reasons.length > 0 ? reasons : ["Matched based on general expertise"];
  }
}

// Export singleton instance
export const expertMatchingService = new ExpertMatchingService();
