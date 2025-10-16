import { apiRequest } from "./api";

export interface Nudge {
  id: string;
  expertName: string;
  expertRole: string;
  expertAvatar?: string | null;
  description: string;
  context: string;
  timestamp: Date;
  status: string;
  matchScore?: number;
  matchReasons?: string[];
  deliveryChannel?: string | null;
  acceptedAt?: Date | null;
  resolvedAt?: Date | null;
  online: boolean;
}

export interface NudgesResponse {
  nudges: Nudge[];
}

/**
 * Fetch all active nudges for the user
 */
export async function fetchNudges(): Promise<NudgesResponse> {
  return apiRequest<NudgesResponse>("/nudges");
}

/**
 * Accept a nudge
 */
export async function acceptNudge(
  nudgeId: string
): Promise<{ success: boolean; nudge: { id: string; status: string; acceptedAt: Date } }> {
  return apiRequest(`/nudges/${nudgeId}/accept`, {
    method: "POST",
  });
}

/**
 * Dismiss a nudge
 */
export async function dismissNudge(
  nudgeId: string
): Promise<{ success: boolean; nudge: { id: string; status: string } }> {
  return apiRequest(`/nudges/${nudgeId}/dismiss`, {
    method: "POST",
  });
}

/**
 * Resolve a nudge
 */
export async function resolveNudge(
  nudgeId: string
): Promise<{ success: boolean; nudge: { id: string; status: string; resolvedAt: Date } }> {
  return apiRequest(`/nudges/${nudgeId}/resolve`, {
    method: "POST",
  });
}
