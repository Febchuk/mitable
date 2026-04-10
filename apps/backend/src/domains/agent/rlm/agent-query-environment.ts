/**
 * Agent Query Environment
 *
 * User-facing data access layer for the in-app Agent (Layer 1 RLM).
 * Personal activity via UserActivityQueryService; org-wide teammate metrics via
 * OrgTeamActivityQueryService when the user is an admin.
 */

import { UserActivityQueryService } from "../../insights/services/user-activity-queries.js";
import { OrgTeamActivityQueryService } from "../../insights/services/org-team-activity-query.service.js";

export class AgentQueryEnvironment {
  private queryService: UserActivityQueryService;
  private orgQueries: OrgTeamActivityQueryService | null;

  constructor(userId: string, organizationId: string, isAdmin: boolean) {
    this.queryService = new UserActivityQueryService(userId);
    this.orgQueries = isAdmin ? new OrgTeamActivityQueryService(organizationId) : null;
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

  /** Admin-only */
  async listTeamMembers() {
    if (!this.orgQueries) return { error: "Not available for non-admin users." };
    return this.orgQueries.listTeamMembers();
  }

  /** Admin-only */
  async queryOrgMetrics(startDate: string, endDate: string) {
    if (!this.orgQueries) return { error: "Not available for non-admin users." };
    return this.orgQueries.queryOrgMetrics(startDate, endDate);
  }

  /** Admin-only */
  async queryUserMetrics(userName: string, startDate: string, endDate: string) {
    if (!this.orgQueries) return { error: "Not available for non-admin users." };
    return this.orgQueries.queryUserMetrics(userName, startDate, endDate);
  }

  /** Admin-only */
  async querySessionSummaries(userName: string, startDate: string, endDate: string) {
    if (!this.orgQueries) return { error: "Not available for non-admin users." };
    return this.orgQueries.querySessionSummaries(userName, startDate, endDate);
  }
}
