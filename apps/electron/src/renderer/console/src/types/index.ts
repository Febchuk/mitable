// View types
export type ViewType = "home" | "roadmap" | "nudges" | "chats";

// Roadmap types
export interface Week {
  number: number;
  percentage: number;
  tasks: Task[];
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  timeEstimate: string;
  completed: boolean;
  week: number;
}

// Nudge types
export type NudgeStatus = "waiting" | "resolved";

export interface Nudge {
  id: string;
  expertName: string;
  expertRole: string;
  avatarUrl?: string;
  description: string;
  timestamp: Date;
  status: NudgeStatus;
  matchScore?: number;
  online?: boolean;
}

// Chat types
export interface Chat {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
  unread?: boolean;
}

// User types
export interface User {
  name: string;
  firstName: string;
  avatarUrl?: string;
  currentWeek: number;
}

// Status badge variants
export type BadgeVariant = "success" | "warning" | "error" | "info";

// Button variants
export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

// Avatar sizes
export type AvatarSize = "sm" | "md" | "lg";
