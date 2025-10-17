// View types
export type ViewType = "home" | "roadmap" | "nudges" | "chats";

// Roadmap types
export interface Week {
  number: number;
  percentage: number;
  tasks: Task[];
}

export interface SourceMaterial {
  id: string;
  title: string;
  type: string;
  url?: string;
  description?: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  timeEstimate: string;
  completed: boolean;
  isActive?: boolean;
  week: number;
  sources?: SourceMaterial[];
}

// Nudge types
export type NudgeStatus = "waiting" | "accepted" | "declined" | "resolved";

export interface Nudge {
  id: string;
  expertName: string;
  expertRole: string;
  avatarUrl?: string;
  description: string;
  context?: string;
  timestamp: Date;
  status: NudgeStatus;
  matchScore?: number;
  online?: boolean;
}

// Chat types
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  type?: "text" | "workflow" | "experts";
  cardData?: {
    title: string;
    subtitle: string;
    iconType: "workflow" | "experts";
  };
}

export interface Chat {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
  unread?: boolean;
  messages: Message[];
}

// User types
export type UserRole = "admin" | "employee";

export interface User {
  id: string;
  name: string;
  firstName: string;
  avatarUrl?: string;
  currentWeek: number;
  role: UserRole;
}

// ============================================
// Template Types (Admin-Created)
// ============================================

export interface Template {
  id: string;
  organizationId: string;
  title: string;
  description?: string;
  icon?: string;
  roleTags: string[];
  totalWeeks: number;
  tasks?: number; // Computed field for UI
  usedCount?: number; // Computed field for UI
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TemplateTask {
  id: string;
  templateId: string;
  weekNumber: number;
  title: string;
  description?: string;
  timeEstimate?: string;
  orderIndex: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// ============================================
// User Roadmap Types
// ============================================

export interface UserTemplateAssignment {
  id: string;
  userId: string;
  templateId: string;
  assignedAt: Date;
  status: "active" | "completed" | "archived";
}

export interface UserRoadmapTask extends Task {
  templateId?: string; // null if custom task
  templateTaskId?: string; // original template task reference
  isCustom: boolean; // true if manually added by admin
}

// Status badge variants
export type BadgeVariant = "success" | "warning" | "error" | "info";

// Button variants
export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

// Avatar sizes
export type AvatarSize = "sm" | "md" | "lg";

// Admin types
export type IntegrationProvider = "slack" | "notion" | "github" | "google-drive";
export type IntegrationStatus = "connected" | "disconnected" | "pending";

export interface Integration {
  id: string;
  provider: IntegrationProvider;
  name: string;
  description: string;
  logoUrl?: string;
  status: IntegrationStatus;
  updatesPerDay?: number;
  connectedAt?: Date;
}

export interface DashboardMetric {
  label: string;
  value: string | number;
  description?: string;
  type: "currency" | "time" | "percentage" | "count";
}

export interface ProductivityData {
  automated: number;
  manual: number;
}

export interface NudgeTheme {
  id: string;
  label: string;
  category: string;
}
