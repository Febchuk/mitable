import { apiRequest } from "./api";
import { createLogger } from "../../../lib/logger";

const logger = createLogger("AdminService");

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  jobTitle?: string | null;
  status: string;
  avatarUrl?: string | null;
  createdAt?: string;
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
  provider: "slack" | "notion" | "github" | "google-drive" | "linear" | "gmail";
  name: string;
  description: string;
  status: "connected" | "disconnected";
  updatesPerDay: number;
  connectedAt?: Date;
  isPerUser?: boolean;
  connectedUsersCount?: number;
}

export interface LinearConnectedUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  connectedAt?: Date;
}

export interface GmailConnectedUser {
  id: string;
  name: string;
  email: string;
  gmailEmail?: string;
  avatarUrl?: string;
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
    logger.error("Error fetching users:", error);
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
    logger.error("Error fetching templates:", error);
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
    logger.error("Error fetching template detail:", error);
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
    logger.error("Error fetching integrations:", error);
    throw error;
  }
}

/**
 * Fetch users with Linear connected (admin only)
 */
export async function fetchLinearConnectedUsers(): Promise<LinearConnectedUser[]> {
  try {
    const response = await apiRequest<{ users: LinearConnectedUser[] }>(
      "/admin/integrations/linear/users"
    );
    return response.users;
  } catch (error) {
    logger.error("Error fetching Linear users:", error);
    throw error;
  }
}

/**
 * Fetch users with Gmail connected (admin only)
 */
export async function fetchGmailConnectedUsers(): Promise<GmailConnectedUser[]> {
  try {
    const response = await apiRequest<{ users: GmailConnectedUser[] }>(
      "/admin/integrations/gmail/users"
    );
    return response.users;
  } catch (error) {
    logger.error("Error fetching Gmail users:", error);
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
    logger.error("Error fetching user detail:", error);
    throw error;
  }
}

export interface CreateUserPayload {
  firstName: string;
  lastName: string;
  email: string;
  role: string; // Job title (e.g., "Software Engineer", "Product Designer")
  sendWelcomeEmail: boolean;
  makeAdmin?: boolean;
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
  initialPassword: string;
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
    logger.error("Error creating user:", error);
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
    logger.error("Error connecting integration:", error);
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
    logger.error("Error disconnecting integration:", error);
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
    logger.error("Error syncing integration:", error);
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
    logger.error("Error updating integration settings:", error);
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
    logger.error("Error creating template:", error);
    throw error;
  }
}

// ============================================
// Organization Settings
// ============================================

export interface OrganizationSettings {
  id: string;
  name: string;
  domain?: string | null;
  settings: {
    variant?: "global" | "nigeria";
  };
}

export interface OrganizationSettingsResponse {
  success: boolean;
  organization: OrganizationSettings;
}

/**
 * Fetch organization settings (admin only)
 */
export async function fetchOrganizationSettings(): Promise<OrganizationSettings> {
  try {
    const response = await apiRequest<OrganizationSettingsResponse>("/admin/organization/settings");
    return response.organization;
  } catch (error) {
    logger.error("Error fetching organization settings:", error);
    throw error;
  }
}

export interface UpdateOrganizationSettingsPayload {
  variant?: "global" | "nigeria";
}

/**
 * Update organization settings (admin only)
 */
export async function updateOrganizationSettings(
  payload: UpdateOrganizationSettingsPayload
): Promise<OrganizationSettings> {
  try {
    const response = await apiRequest<OrganizationSettingsResponse>(
      "/admin/organization/settings",
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      }
    );
    return response.organization;
  } catch (error) {
    logger.error("Error updating organization settings:", error);
    throw error;
  }
}

// ============================================
// Dashboard Analytics (from cron pipeline)
// ============================================

export type DashboardPeriod = "yesterday" | "today" | "week" | "month" | "ytd" | "all";

export interface DashboardMetrics {
  period: string;
  hasData: boolean;
  metrics: {
    avgWorkMinutes: number;
    avgMeetingMinutes: number;
    avgActiveMinutes: number;
    avgWorkPercentage: number;
    avgMeetingPercentage: number;
    totalUsersTracked: number;
    totalTeamWorkMinutes: number;
    totalTeamMeetingMinutes: number;
  };
  activityDistribution: Array<{ category: string; percentage: number; totalMinutes: number }>;
  topApps: Array<{ app: string; totalMinutes: number; userCount: number }>;
  userSummaries: Array<{
    userId: string;
    name: string;
    activeMinutes: number;
    workPct: number;
    meetingPct: number;
  }>;
  dailyTrend: Array<{
    date: string;
    avgActiveMinutes: number;
    avgWorkMinutes: number;
    avgMeetingMinutes: number;
    usersTracked: number;
  }>;
}

export interface DashboardPerson {
  userId: string;
  name: string;
  email?: string;
  role?: string;
  jobTitle?: string;
  avatarUrl?: string | null;
  userStatus?: string;
  createdAt?: string;
  totalWorkMinutes: number;
  totalMeetingMinutes: number;
  totalActiveMinutes: number;
  avgActiveMinutesPerDay: number;
  workPercentage: number;
  meetingPercentage: number;
  recentHighlight: string | null;
  lastActiveAt: string | null;
  categoryBreakdown: Array<{ category: string; percentage: number; minutes: number }>;
  appBreakdown: Array<{ app: string; minutes: number }>;
  daysTracked: number;
  hasActivity: boolean;
}

export interface ActivityBlock {
  id: string;
  type: "work" | "meeting";
  name: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  description: string | null;
  apps: string[];
  category: string | null;
  participants?: string[];
  sequenceNumber: number;
}

export interface ClassifiedActivity {
  activity: string;
  category: string;
  minutes: number;
  description: string;
}

export interface SessionActivity {
  sessionId: string;
  sessionName: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  summary: string | null;
  activities: ClassifiedActivity[];
}

export interface DashboardPersonDetail {
  period: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    jobTitle: string | null;
    avatarUrl: string | null;
  };
  summary: {
    totalWorkMinutes: number;
    totalMeetingMinutes: number;
    totalActiveMinutes: number;
    workPercentage: number;
    meetingPercentage: number;
    daysTracked: number;
  };
  dailyActivities: Array<{
    date: string;
    totalWorkMinutes: number;
    totalMeetingMinutes: number;
    totalActiveMinutes: number;
    workPercentage: number;
    meetingPercentage: number;
    daySummary: string | null;
    keyAccomplishments: string[];
    categoryBreakdown: any;
    appBreakdown: any;
  }>;
  blocks: ActivityBlock[];
  blocksByDate: Record<string, ActivityBlock[]>;
  sessionActivities: SessionActivity[];
  documents: Array<{
    id: string;
    title: string;
    docType: string;
    status: string;
    content: string;
    description: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
}

/**
 * Fetch org-wide dashboard metrics (admin only)
 */
export async function fetchDashboardMetrics(
  period: DashboardPeriod = "yesterday"
): Promise<DashboardMetrics> {
  try {
    const response = await apiRequest<DashboardMetrics>(`/admin/dashboard?period=${period}`);
    return response;
  } catch (error) {
    logger.error("Error fetching dashboard metrics:", error);
    throw error;
  }
}

/**
 * Fetch all org users with lifetime activity summaries for People tab (admin only).
 * No date filtering — the backend returns ALL users with aggregated lifetime stats.
 */
export async function fetchDashboardPeople(): Promise<DashboardPerson[]> {
  try {
    const response = await apiRequest<{ people: DashboardPerson[] }>(`/admin/dashboard/people`);
    return response.people;
  } catch (error) {
    logger.error("Error fetching dashboard people:", error);
    throw error;
  }
}

/**
 * Fetch detailed activity for a specific user (admin only)
 */
export async function fetchDashboardPersonDetail(
  userId: string,
  period: DashboardPeriod = "yesterday"
): Promise<DashboardPersonDetail> {
  try {
    const response = await apiRequest<DashboardPersonDetail>(
      `/admin/dashboard/people/${userId}?period=${period}`
    );
    return response;
  } catch (error) {
    logger.error("Error fetching person activity detail:", error);
    throw error;
  }
}

// ── Drill-Down Data ──────────────────────────────────────────

export interface DrillDownData {
  title: string;
  subtitle: string;
  stats: { label: string; value: string }[];
  breakdown: { label: string; value: string; bar?: number }[];
  trend: { label: string; value: number }[];
}

/**
 * Fetch drill-down breakdown for a specific metric or category (admin only)
 * Metrics: focus_time, active_time, meeting_load, people_tracked
 * Categories: development, communication, meeting, browsing, etc.
 */
export async function fetchDrillDown(
  metric: string,
  period: DashboardPeriod = "yesterday"
): Promise<DrillDownData> {
  try {
    return await apiRequest<DrillDownData>(
      `/admin/dashboard/drill-down/${encodeURIComponent(metric)}?period=${period}`
    );
  } catch (error) {
    logger.error("Error fetching drill-down data:", error);
    throw error;
  }
}

/**
 * Fetch per-user drill-down breakdown for a specific metric or category (admin only)
 */
export async function fetchUserDrillDown(
  userId: string,
  metric: string,
  period: DashboardPeriod = "yesterday"
): Promise<DrillDownData> {
  try {
    return await apiRequest<DrillDownData>(
      `/admin/dashboard/people/${userId}/drill-down/${encodeURIComponent(metric)}?period=${period}`
    );
  } catch (error) {
    logger.error("Error fetching user drill-down data:", error);
    throw error;
  }
}

/**
 * Per-user category activity blocks (for Activity Breakdown drill-down)
 */
export interface CategoryActivity {
  id: string;
  name: string;
  description: string | null;
  blockType: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  apps: string[];
  sessionId: string | null;
}

export interface CategoryActivitiesResponse {
  category: string;
  period: string;
  totalMinutes: number;
  totalHours: number;
  activityCount: number;
  activities: CategoryActivity[];
}

export async function fetchCategoryActivities(
  userId: string,
  category: string,
  period: DashboardPeriod = "all"
): Promise<CategoryActivitiesResponse> {
  try {
    return await apiRequest<CategoryActivitiesResponse>(
      `/admin/dashboard/people/${userId}/category-activities/${encodeURIComponent(category)}?period=${period}`
    );
  } catch (error) {
    logger.error("Error fetching category activities:", error);
    throw error;
  }
}

// ── Ask Threads CRUD ──────────────────────────────────────────

export interface AskThread {
  id: string;
  userId: string;
  organizationId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AskMessageRow {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  reportTitle: string | null;
  reportSubtitle: string | null;
  reportHtml: string | null;
  createdAt: string;
}

export async function fetchAskThreads(): Promise<AskThread[]> {
  try {
    return await apiRequest<AskThread[]>("/admin/ask/threads");
  } catch (error) {
    logger.error("Error fetching ask threads:", error);
    throw error;
  }
}

export async function fetchAskThreadMessages(threadId: string): Promise<AskMessageRow[]> {
  try {
    return await apiRequest<AskMessageRow[]>(`/admin/ask/threads/${threadId}/messages`);
  } catch (error) {
    logger.error("Error fetching thread messages:", error);
    throw error;
  }
}

export async function deleteAskThread(threadId: string): Promise<void> {
  try {
    await apiRequest(`/admin/ask/threads/${threadId}`, { method: "DELETE" });
  } catch (error) {
    logger.error("Error deleting ask thread:", error);
    throw error;
  }
}

export async function updateAskMessageReport(messageId: string, reportHtml: string): Promise<void> {
  try {
    await apiRequest(`/admin/ask/messages/${messageId}/report`, {
      method: "PATCH",
      body: JSON.stringify({ reportHtml }),
    });
  } catch (error) {
    logger.error("Error updating report:", error);
    throw error;
  }
}

export async function sendAskChat(
  message: string,
  threadId?: string
): Promise<{
  message: string;
  threadId: string;
  messageId: string;
  report?: { title: string; subtitle: string; html: string };
}> {
  try {
    const response = await apiRequest<{
      message: string;
      threadId: string;
      messageId: string;
      report?: { title: string; subtitle: string; html: string };
    }>("/admin/ask/chat", {
      method: "POST",
      body: JSON.stringify({ message, threadId }),
    });
    return response;
  } catch (error) {
    logger.error("Error in ask chat:", error);
    throw error;
  }
}

/**
 * Send a chat message to the dashboard AI assistant (admin only)
 */
export async function sendDashboardChat(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  period: DashboardPeriod = "month"
): Promise<{ message: string }> {
  try {
    const response = await apiRequest<{ message: string }>("/admin/dashboard/chat", {
      method: "POST",
      body: JSON.stringify({ messages, period }),
    });
    return response;
  } catch (error) {
    logger.error("Error in dashboard chat:", error);
    throw error;
  }
}
