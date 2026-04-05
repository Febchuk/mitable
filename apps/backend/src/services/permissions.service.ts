import { db } from "../db/client.js";
import { users } from "../db/schema/index.js";
import { eq, sql } from "drizzle-orm";

/**
 * Centralized permissions service for hierarchical org structure.
 * Replaces inline role checks with scoped authorization logic.
 */

/**
 * Get all user IDs visible to an actor:
 * - Admin: all users in their org
 * - Manager: self + all transitive reports
 * - Employee: self only
 */
export async function getVisibleUserIds(
  actorId: string,
  organizationId: string,
  role: string
): Promise<string[]> {
  if (role === "admin") {
    const orgUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.organizationId, organizationId));
    return orgUsers.map((u) => u.id);
  }

  // For non-admins, get self + transitive reports
  const reports = await getTransitiveReportIds(actorId);
  return [actorId, ...reports];
}

/**
 * Recursive CTE to get all transitive report IDs.
 * Returns empty array if user has no reports.
 */
export async function getTransitiveReportIds(managerId: string): Promise<string[]> {
  const result = await db.execute(sql`
    WITH RECURSIVE report_tree AS (
      SELECT id FROM users WHERE manager_id = ${managerId}
      UNION ALL
      SELECT u.id FROM users u
      JOIN report_tree rt ON u.manager_id = rt.id
    )
    SELECT id FROM report_tree
  `);
  return (result.rows as { id: string }[]).map((r) => r.id);
}

/**
 * Get direct reports only (not transitive).
 */
export async function getDirectReports(managerId: string) {
  return db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      jobTitle: users.jobTitle,
      avatarUrl: users.avatarUrl,
      status: users.status,
      department: users.department,
      teamId: users.teamId,
    })
    .from(users)
    .where(eq(users.managerId, managerId));
}

/**
 * Check if actor has at least one direct report.
 */
export async function isManager(userId: string): Promise<boolean> {
  const result = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.managerId, userId))
    .limit(1);
  return result.length > 0;
}

/**
 * Check if actor can view target user's data.
 * True if: actor is admin in same org, actor is target's manager (transitive), or actor IS target.
 */
export async function canViewUserData(
  actorId: string,
  targetUserId: string,
  actorRole: string,
  actorOrgId: string
): Promise<boolean> {
  if (actorId === targetUserId) return true;

  if (actorRole === "admin") {
    const [target] = await db
      .select({ organizationId: users.organizationId })
      .from(users)
      .where(eq(users.id, targetUserId));
    return target?.organizationId === actorOrgId;
  }

  const reportIds = await getTransitiveReportIds(actorId);
  return reportIds.includes(targetUserId);
}

/**
 * Check if actor can edit a session (replaces isOwnerOrOrgAdmin).
 * True if: actor owns the session, is admin in same org, or manages the session owner.
 */
export async function canEditSession(
  actorId: string,
  sessionOwnerId: string,
  actorRole: string,
  actorOrgId: string
): Promise<boolean> {
  if (actorId === sessionOwnerId) return true;
  return canViewUserData(actorId, sessionOwnerId, actorRole, actorOrgId);
}

/**
 * Check if actorId is a manager of targetId (direct or transitive).
 */
export async function isManagerOf(actorId: string, targetUserId: string): Promise<boolean> {
  const reportIds = await getTransitiveReportIds(actorId);
  return reportIds.includes(targetUserId);
}

/**
 * Get user IDs scoped by the requested data scope.
 * - "direct": self + direct reports only
 * - "all-reports": self + transitive reports
 * - "org-wide": all org users (only if admin or has canSeeOrgWide permission)
 */
export async function getScopedUserIds(
  actorId: string,
  organizationId: string,
  role: string,
  permissions: string[],
  scope: "direct" | "all-reports" | "org-wide"
): Promise<string[]> {
  // Validate org-wide access — silently downgrade if not authorized
  if (scope === "org-wide" && role !== "admin" && !permissions.includes("canSeeOrgWide")) {
    scope = "all-reports";
  }

  if (scope === "org-wide") {
    const orgUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.organizationId, organizationId));
    return orgUsers.map((u) => u.id);
  }

  if (scope === "direct") {
    const directs = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.managerId, actorId));
    return [actorId, ...directs.map((u) => u.id)];
  }

  // "all-reports" — self + transitive
  const reports = await getTransitiveReportIds(actorId);
  return [actorId, ...reports];
}

/**
 * Check if setting proposedManagerId as manager of targetUserId would create a cycle.
 * Walks up the chain from proposedManager; if we reach targetUser, it's a cycle.
 */
export async function wouldCreateCycle(
  targetUserId: string,
  proposedManagerId: string
): Promise<boolean> {
  if (targetUserId === proposedManagerId) return true;

  let currentId: string | null = proposedManagerId;
  const visited = new Set<string>();

  while (currentId) {
    if (currentId === targetUserId) return true;
    if (visited.has(currentId)) return false; // existing cycle detected, bail
    visited.add(currentId);

    const [user] = await db
      .select({ managerId: users.managerId })
      .from(users)
      .where(eq(users.id, currentId));
    currentId = user?.managerId ?? null;
  }
  return false;
}
