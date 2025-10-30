import { db } from "../db/client";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

/**
 * Expert match result
 */
export interface ExpertMatch {
  expert: {
    id: string;
    userId: string;
    name: string;
    email: string;
    department: string;
    role: string;
    expertise: string[];
    avatarUrl?: string;
    responseRate: number;
    helpfulnessRating: number;
    availability: "available" | "away" | "busy" | "offline";
  };
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
   * SIMPLIFIED VERSION: Returns first 5 users in organization with mock data
   * For testing UI without needing expertProfiles setup
   *
   * @param query - User's question or topic (not used in simplified version)
   * @param organizationId - Organization to search within
   * @param topK - Number of experts to return (default: 5)
   * @returns List of users formatted as expert matches
   */
  async findExperts(
    query: string,
    organizationId: string,
    topK: number = 5
  ): Promise<ExpertMatch[]> {
    console.log(`[ExpertMatchingService] Finding experts (simplified): "${query}"`);
    console.log("[ExpertMatchingService] Request params:", {
      query,
      organizationId,
      topK,
    });

    try {
      // Simplified: Just get ALL users in organization (first topK)
      const allUsers = await db
        .select({
          userId: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          role: users.role,
          avatarUrl: users.avatarUrl,
          status: users.status,
        })
        .from(users)
        .where(eq(users.organizationId, organizationId))
        .limit(topK);

      console.log("[ExpertMatchingService] Query executed:", {
        usersFound: allUsers.length,
        requestedTopK: topK,
      });

      if (allUsers.length === 0) {
        console.log("[ExpertMatchingService] No users found in organization");
        return [];
      }

      console.log(`[ExpertMatchingService] Found ${allUsers.length} users (simplified)`);
      console.log("[ExpertMatchingService] User details:", {
        names: allUsers.map((u) => [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email),
        roles: allUsers.map((u) => u.role),
      });

      // Format as ExpertMatch with mock data
      const matches: ExpertMatch[] = allUsers.map((user, index) => {
        // Construct full name from firstName + lastName
        const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
        const availability = this.mapAvailability(user.status as string);
        const responseRate = 85.0;
        const helpfulnessScore = 4.5;

        return {
          expert: {
            id: user.userId,
            userId: user.userId,
            name: fullName,
            email: user.email,
            department: "General", // Hardcoded since field doesn't exist in schema
            role: user.role || "Employee",
            expertise: ["Team support", "General knowledge"],
            avatarUrl: user.avatarUrl || undefined,
            responseRate: responseRate,
            helpfulnessRating: helpfulnessScore,
            availability: availability,
          },
          matchScore: Math.round((0.9 - index * 0.1) * 100) / 100, // Mock decreasing scores: 0.9, 0.8, 0.7, ...
          matchReasons: ["Available to help", "Works in your team", "Experienced team member"],
          expertise: {
            summary: `${user.role || "Employee"} with general knowledge`,
            topics: ["Team support", "General knowledge"],
          },
          performance: {
            responseRate: responseRate,
            helpfulnessScore: helpfulnessScore,
            avgResponseTime: null,
            totalInteractions: 0,
          },
        };
      });

      console.log("[ExpertMatchingService] Matches created:", {
        matchesCount: matches.length,
        topMatch: matches[0]?.expert.name,
        topScore: matches[0]?.matchScore,
        allScores: matches.map((m) => m.matchScore),
      });

      return matches;
    } catch (error) {
      console.error("[ExpertMatchingService] Error finding experts:", error);
      throw error;
    }
  }

  /**
   * Map status string to availability enum
   */
  private mapAvailability(status: string): "available" | "away" | "busy" | "offline" {
    if (["available", "away", "busy", "offline"].includes(status)) {
      return status as "available" | "away" | "busy" | "offline";
    }
    return "offline";
  }
}

// Export singleton instance
export const expertMatchingService = new ExpertMatchingService();
