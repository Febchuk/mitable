import { Request, Response, NextFunction } from "express";
import { canViewUserData, getVisibleUserIds, getScopedUserIds } from "../services/permissions.service.js";

/**
 * Requires the authenticated user to be an org admin.
 * Use for: org settings, user CRUD, integration management.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.userRole !== "admin") {
    res.status(403).json({ error: "Forbidden", message: "Admin access required" });
    return;
  }
  next();
}

/**
 * Requires the authenticated user to be an org admin or a manager (has direct reports).
 * Use for: dashboard, people viewing, benchmark assignment.
 */
export function requireManagerOrAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.userRole !== "admin" && !req.isManager) {
    res.status(403).json({ error: "Forbidden", message: "Manager or admin access required" });
    return;
  }
  next();
}

/**
 * Validates that the authenticated user can view data for the user ID in req.params[paramName].
 * Checks: self-access, admin in same org, or transitive manager.
 */
export function requireAccessToUser(paramName: string = "id") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const targetUserId = req.params[paramName];
    if (!targetUserId) {
      res.status(400).json({ error: "Bad Request", message: `Missing ${paramName} parameter` });
      return;
    }

    const hasAccess = await canViewUserData(
      req.userId!,
      targetUserId,
      req.userRole!,
      req.organizationId!
    );

    if (!hasAccess) {
      res.status(403).json({
        error: "Forbidden",
        message: "You do not have access to this user's data",
      });
      return;
    }

    next();
  };
}

/**
 * Per-request cached helper to get visible user IDs.
 * Avoids re-running the recursive CTE within the same request.
 */
export async function getCachedVisibleUserIds(req: Request): Promise<string[]> {
  if (!req._visibleUserIds) {
    req._visibleUserIds = await getVisibleUserIds(
      req.userId!,
      req.organizationId!,
      req.userRole!
    );
  }
  return req._visibleUserIds;
}

/**
 * Scope-aware visible user IDs.
 * Reads ?scope=direct|all-reports|org-wide from query params.
 * Falls back to "all-reports" if no scope provided.
 */
export async function getScopedVisibleUserIds(req: Request): Promise<string[]> {
  const validScopes = ["direct", "all-reports", "org-wide"] as const;
  const rawScope = req.query.scope as string | undefined;
  const scope = rawScope && validScopes.includes(rawScope as any)
    ? (rawScope as "direct" | "all-reports" | "org-wide")
    : "all-reports";

  return getScopedUserIds(
    req.userId!,
    req.organizationId!,
    req.userRole!,
    req.userPermissions || [],
    scope
  );
}
