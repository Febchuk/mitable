import { db } from "../db/client.js";
import { userPermissions } from "../db/schema/index.js";
import { users } from "../db/schema/index.js";
import { eq, and } from "drizzle-orm";

/**
 * Get all permissions for a user.
 */
export async function getUserPermissions(userId: string): Promise<string[]> {
  const rows = await db
    .select({ permission: userPermissions.permission })
    .from(userPermissions)
    .where(eq(userPermissions.userId, userId));
  return rows.map((r) => r.permission);
}

/**
 * Check if a user has a specific permission.
 */
export async function hasPermission(userId: string, permission: string): Promise<boolean> {
  const rows = await db
    .select({ id: userPermissions.id })
    .from(userPermissions)
    .where(and(eq(userPermissions.userId, userId), eq(userPermissions.permission, permission)))
    .limit(1);
  return rows.length > 0;
}

/**
 * Grant a permission to a user. No-op if already granted.
 */
export async function grantPermission(
  userId: string,
  permission: string,
  grantedBy: string
): Promise<void> {
  await db.insert(userPermissions).values({ userId, permission, grantedBy }).onConflictDoNothing();
}

/**
 * Revoke a permission from a user. No-op if not granted.
 */
export async function revokePermission(userId: string, permission: string): Promise<void> {
  await db
    .delete(userPermissions)
    .where(and(eq(userPermissions.userId, userId), eq(userPermissions.permission, permission)));
}

/**
 * Get all users in an org with their permissions (for the admin permissions UI).
 */
export async function getOrgUsersWithPermissions(organizationId: string) {
  const orgUsers = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      role: users.role,
      jobTitle: users.jobTitle,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(eq(users.organizationId, organizationId));

  // Batch-fetch all permissions for these users
  const userIds = orgUsers.map((u) => u.id);
  if (userIds.length === 0) return [];

  const allPerms = await db
    .select({ userId: userPermissions.userId, permission: userPermissions.permission })
    .from(userPermissions);

  const permsByUser = new Map<string, string[]>();
  for (const p of allPerms) {
    if (!userIds.includes(p.userId)) continue;
    const existing = permsByUser.get(p.userId) || [];
    existing.push(p.permission);
    permsByUser.set(p.userId, existing);
  }

  return orgUsers.map((u) => ({
    ...u,
    name: `${u.firstName || ""} ${u.lastName || ""}`.trim(),
    permissions: permsByUser.get(u.id) || [],
  }));
}
