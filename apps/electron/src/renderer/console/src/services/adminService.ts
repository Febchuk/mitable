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

export interface TemplateTask {
  id: string;
  title: string;
  description: string | null;
  timeEstimate: string | null;
  orderIndex: number;
  sources: any[]; // Source materials to be implemented
}

export interface TemplateWeek {
  weekNumber: number;
  tasks: TemplateTask[];
}

export interface AssignedUser {
  id: string;
  name: string;
  email: string;
  role: string;
  progress: number;
  assignedAt: Date | string;
}

export interface TemplateDetail {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  roleTags: string[];
  totalWeeks: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  tasksByWeek: TemplateWeek[];
  usageStats: {
    assignedCount: number;
    assignedUsers: AssignedUser[];
  };
  taskCount: number;
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
 * Fetch template details by ID (admin only)
 */
export async function fetchTemplateDetail(id: string): Promise<TemplateDetail> {
  try {
    const response = await apiRequest<{ template: TemplateDetail }>(`/admin/templates/${id}`);
    return response.template;
  } catch (error) {
    console.error("Error fetching template detail:", error);
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

export interface CreateUserPayload {
  firstName: string;
  lastName: string;
  email: string;
  role: string; // Job title (e.g., "Software Engineer", "Product Designer")
  startDate: string;
  templateIds: string[];
  sendWelcomeEmail: boolean;
}

export interface CreateUserResponse {
  success: boolean;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  };
  templatesAssigned: number;
  tasksCreated: number;
}

/**
 * Create a new user (admin only)
 */
export async function createUser(payload: CreateUserPayload): Promise<CreateUserResponse> {
  try {
    const response = await apiRequest<CreateUserResponse>("/admin/users", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return response;
  } catch (error) {
    console.error("Error creating user:", error);
    throw error;
  }
}

export interface ConnectIntegrationPayload {
  accessToken?: string;
  refreshToken?: string;
  metadata?: Record<string, any>;
}

export interface IntegrationResponse {
  success: boolean;
  integration: Integration;
}

export interface SyncResponse {
  success: boolean;
  syncLog: {
    id: string;
    integrationId: string;
    status: string;
    startedAt: Date;
    completedAt?: Date;
  };
}

/**
 * Connect an integration (admin only)
 */
export async function connectIntegration(
  integrationId: string,
  payload?: ConnectIntegrationPayload
): Promise<IntegrationResponse> {
  try {
    const response = await apiRequest<IntegrationResponse>(
      `/admin/integrations/${integrationId}/connect`,
      {
        method: "POST",
        body: JSON.stringify(payload || {}),
      }
    );
    return response;
  } catch (error) {
    console.error("Error connecting integration:", error);
    throw error;
  }
}

/**
 * Disconnect an integration (admin only)
 */
export async function disconnectIntegration(integrationId: string): Promise<IntegrationResponse> {
  try {
    const response = await apiRequest<IntegrationResponse>(
      `/admin/integrations/${integrationId}/disconnect`,
      {
        method: "POST",
      }
    );
    return response;
  } catch (error) {
    console.error("Error disconnecting integration:", error);
    throw error;
  }
}

/**
 * Trigger manual sync for an integration (admin only)
 */
export async function syncIntegration(integrationId: string): Promise<SyncResponse> {
  try {
    const response = await apiRequest<SyncResponse>(`/admin/integrations/${integrationId}/sync`, {
      method: "POST",
    });
    return response;
  } catch (error) {
    console.error("Error syncing integration:", error);
    throw error;
  }
}

/**
 * Update integration settings (admin only)
 */
export async function updateIntegrationSettings(
  integrationId: string,
  metadata: Record<string, any>
): Promise<IntegrationResponse> {
  try {
    const response = await apiRequest<IntegrationResponse>(`/admin/integrations/${integrationId}`, {
      method: "PATCH",
      body: JSON.stringify({ metadata }),
    });
    return response;
  } catch (error) {
    console.error("Error updating integration settings:", error);
    throw error;
  }
}

export interface CreateTemplateTask {
  weekNumber: number;
  title: string;
  description?: string | null;
  timeEstimate?: string | null;
  orderIndex?: number;
}

export interface CreateTemplatePayload {
  title: string;
  description?: string;
  icon?: string;
  color?: string;
  roleTags?: string[];
  totalWeeks?: number;
  notionUrl?: string;
  tasks?: CreateTemplateTask[];
}

export interface CreateTemplateResponse {
  success: boolean;
  template: Template;
  tasksCreated: number;
}

/**
 * Create a new roadmap template (admin only)
 */
export async function createTemplate(
  payload: CreateTemplatePayload
): Promise<CreateTemplateResponse> {
  try {
    const response = await apiRequest<CreateTemplateResponse>("/admin/templates", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return response;
  } catch (error) {
    console.error("Error creating template:", error);
    throw error;
  }
}
