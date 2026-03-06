// Chat types
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  type?: "text" | "workflow";
  workflowSessionId?: string | null; // Links to workflow session
  relatedStepIndex?: number | null; // Which step this message relates to
  cardData?: {
    title: string;
    subtitle: string;
    iconType: "workflow";
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
  email?: string;
  avatarUrl?: string;
  currentWeek: number;
  role: UserRole;
  originalRole?: UserRole;
  organizationId: string;
}

// Status badge variants
export type BadgeVariant = "success" | "warning" | "error" | "info";

// Button variants
export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

// Avatar sizes
export type AvatarSize = "sm" | "md" | "lg";

// Admin types
export type IntegrationProvider =
  | "slack"
  | "notion"
  | "github"
  | "google-drive"
  | "linear"
  | "gmail";
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
  isPerUser?: boolean;
  connectedUsersCount?: number;
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
