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
  provider: string;
  name: string;
  description: string;
  status: "connected" | "disconnected";
  updatesPerDay: number;
  connectedAt?: Date;
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
