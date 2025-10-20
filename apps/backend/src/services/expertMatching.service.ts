import { db } from "../db/client";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

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
        names: allUsers.map(u => [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email),
        roles: allUsers.map(u => u.role),
      });

      // Format as ExpertMatch with mock data
      const matches: ExpertMatch[] = allUsers.map((user, index) => {
        // Construct full name from firstName + lastName
        const fullName = [user.firstName, user.lastName]
          .filter(Boolean)
          .join(" ") || user.email;

        return {
          userId: user.userId,
          name: fullName,
          email: user.email,
          role: user.role || "Employee",
          department: "General", // Hardcoded since field doesn't exist in schema
          avatarUrl: user.avatarUrl || undefined,
          matchScore: Math.round((0.9 - index * 0.1) * 100) / 100, // Mock decreasing scores: 0.9, 0.8, 0.7, ...
          matchReasons: [
            "Available to help",
            "Works in your team",
            "Experienced team member",
          ],
          expertise: {
            summary: `${user.role || "Employee"} with general knowledge`,
            topics: ["Team support", "General knowledge"],
          },
          performance: {
            responseRate: 85.0,
            helpfulnessScore: 4.5,
            avgResponseTime: null,
            totalInteractions: 0,
          },
          availability: this.mapAvailability(user.status as string),
        };
      });

      console.log("[ExpertMatchingService] Matches created:", {
        matchesCount: matches.length,
        topMatch: matches[0]?.name,
        topScore: matches[0]?.matchScore,
        allScores: matches.map(m => m.matchScore),
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
  private mapAvailability(
    status: string
  ): "available" | "away" | "busy" | "offline" {
    if (["available", "away", "busy", "offline"].includes(status)) {
      return status as "available" | "away" | "busy" | "offline";
    }
    return "offline";
  }
}

// Export singleton instance
export const expertMatchingService = new ExpertMatchingService();
