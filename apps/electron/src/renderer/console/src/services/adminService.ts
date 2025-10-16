import { apiRequest } from "./api";

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  startDate: string;
  status: "Onboarding" | "Active";
  progress: number;
  avatarUrl?: string | null;
}

export interface Template {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  roleTags: string[];
  totalWeeks: number;
  tasks: number;
  usedCount: number;
}

export interface Integration {
  id: string;
  provider: "slack" | "notion" | "github" | "google-drive";
  name: string;
  description: string;
  status: "connected" | "disconnected";
  updatesPerDay: number;
  connectedAt?: Date;
}

export interface UserRoadmapInstance {
  id: string;
  title: string;
  tasks: number;
  completion: number;
  description: string;
}

export interface Conversation {
  id: string;
  timestamp: string;
  question: string;
  status: "resolved" | "nudge";
}

export interface NudgeTheme {
  theme: string;
  count: number;
  nudges: Array<{ name: string; count: number }>;
}

export interface ActivityData {
  date: string;
  hours: number;
}

export interface UserDetail {
  id: string;
  name: string;
  role: string;
  startDate: string;
  status: "Onboarding" | "Active";
  progress: number;
  manager: { name: string; id: string } | null;
  metrics: {
    totalTasks: number;
    completedTasks: number;
    overdueTasks: number;
  };
  assignedRoadmaps: UserRoadmapInstance[];
  conversations: Conversation[];
  nudgeThemes: NudgeTheme[];
  activityData: ActivityData[];
}

/**
 * Fetch all users (admin only)
 */
export async function fetchUsers(): Promise<User[]> {
  try {
    const response = await apiRequest<{ users: User[] }>("/admin/users");
    return response.users;
  } catch (error) {
    console.error("Error fetching users:", error);
    throw error;
  }
}

/**
 * Fetch all templates (admin only)
 */
export async function fetchTemplates(): Promise<Template[]> {
  try {
    const response = await apiRequest<{ templates: Template[] }>("/admin/templates");
    return response.templates;
  } catch (error) {
    console.error("Error fetching templates:", error);
    throw error;
  }
}

/**
 * Fetch all integrations (admin only)
 */
export async function fetchIntegrations(): Promise<Integration[]> {
  try {
    const response = await apiRequest<{ integrations: Integration[] }>("/admin/integrations");
    return response.integrations;
  } catch (error) {
    console.error("Error fetching integrations:", error);
    throw error;
  }
}

/**
 * Fetch detailed information for a single user (admin only)
 */
export async function fetchUserDetail(userId: string): Promise<UserDetail> {
  try {
    const response = await apiRequest<{ user: UserDetail }>(`/admin/users/${userId}`);
    return response.user;
  } catch (error) {
    console.error("Error fetching user detail:", error);
    throw error;
  }
}
