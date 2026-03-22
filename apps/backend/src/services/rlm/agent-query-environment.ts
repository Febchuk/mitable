/**
 * Agent Query Environment
 *
 * User-facing data access layer for the Agent's conversational query layer (Layer 1).
 * Delegates to UserActivityQueryService for all data access.
 */

import { UserActivityQueryService } from "../user-activity-queries.js";

export class AgentQueryEnvironment {
  private queryService: UserActivityQueryService;

  constructor(userId: string, _organizationId: string) {
    this.queryService = new UserActivityQueryService(userId);
  }

  async getMyActivity(startDate?: string, endDate?: string) {
    return this.queryService.getActivity(startDate, endDate);
  }

  async getActivityDetail(id: string, type: "block" | "session" | "document") {
    const result = await this.queryService.getActivityDetail(id, type);
    if (!result) {
      const labels = { block: "Activity block", session: "Session", document: "Document" };
      return { error: `${labels[type] || "Item"} not found` };
    }
    return result;
  }
}
