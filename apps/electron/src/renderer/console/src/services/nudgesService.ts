import { apiRequest } from "./api";

export interface Nudge {
  id: string;
  expertName: string;
  expertRole: string;
  expertAvatar?: string | null;
  description: string;
  context: string;
  timestamp: Date;
  status: "waiting" | "accepted" | "declined" | "resolved";
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

// Types for create nudge
export interface NudgeResource {
  type: "file" | "link" | "screenshot";
  url: string;
  filename?: string;
  filesize?: number;
}

export interface CreateNudgeRequest {
  recipientIds: string[];
  context: string;
  question?: string;
  isDraft?: boolean;
  resources?: NudgeResource[];
}

export interface CreateNudgeResponse {
  success: boolean;
  nudges: Array<{ id: string }>;
  message: string;
}

/**
 * Create a new nudge
 */
export async function createNudge(data: CreateNudgeRequest): Promise<CreateNudgeResponse> {
  return apiRequest("/nudges/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
}

// Types for search
export interface Expert {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string | null;
  status: string;
  responseRate: number;
  helpfulnessScore: number;
  expertiseSummary?: string | null;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string | null;
  status: string;
}

/**
 * Search for experts
 */
export async function searchExperts(query: string): Promise<{ experts: Expert[] }> {
  return apiRequest(`/nudges/experts/search?query=${encodeURIComponent(query)}`);
}

/**
 * Search for users in organization
 */
export async function searchUsers(query: string): Promise<{ users: User[] }> {
  return apiRequest(`/nudges/users/search?query=${encodeURIComponent(query)}`);
}
