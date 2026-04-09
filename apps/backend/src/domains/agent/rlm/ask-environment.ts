/* =============================================================================
 * DEPRECATED — Ask RLM (admin analytics tool loop + /admin/ask/*).
 * Not in active product use. Scheduled for deletion in an upcoming cleanup.
 * Do not extend. Use OrgTeamActivityQueryService / agent-query-* for org metrics.
 * =============================================================================
 *
 * Thin wrapper over OrgTeamActivityQueryService for legacy call sites only.
 */

import { OrgTeamActivityQueryService } from "../../insights/services/org-team-activity-query.service.js";

export class AskEnvironment {
  private readonly org: OrgTeamActivityQueryService;

  constructor(organizationId: string) {
    this.org = new OrgTeamActivityQueryService(organizationId);
  }

  async listTeamMembers() {
    return this.org.listTeamMembers();
  }

  async queryOrgMetrics(startDate: string, endDate: string) {
    return this.org.queryOrgMetrics(startDate, endDate);
  }

  async queryUserMetrics(userName: string, startDate: string, endDate: string) {
    return this.org.queryUserMetrics(userName, startDate, endDate);
  }

  async querySessionSummaries(userName: string, startDate: string, endDate: string) {
    return this.org.querySessionSummaries(userName, startDate, endDate);
  }
}
