import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { DashboardMetric, ProductivityData, NudgeTheme } from "../types";
import {
  fetchIntegrations,
  fetchUsers,
  fetchTemplates,
  type User,
  type Template,
  type Integration,
} from "../services/adminService";
import { authService } from "../services/authService";
import { useUser } from "./UserContext";

interface AdminContextType {
  integrations: Integration[];
  users: User[];
  templates: Template[];
  loading: boolean;
  error: string | null;
  connectIntegration: (id: string, token?: string) => void;
  disconnectIntegration: (id: string) => void;
  configureIntegration: (id: string) => void;
  syncIntegration: (id: string) => void;
  viewIntegrationDetails: (id: string) => void;
  savingsMetric: DashboardMetric;
  timeToProductivity: DashboardMetric;
  productivityData: ProductivityData;
  nudgeThemes: NudgeTheme[];
  refetchData: () => void;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [savingsMetric] = useState<DashboardMetric>({
    label: "Total Savings",
    value: "$50,000",
    description:
      "Cost savings from AI-powered onboarding, helping new employees complete tasks faster and answering questions.",
    type: "currency",
  });

  const [timeToProductivity] = useState<DashboardMetric>({
    label: "Time to Productivity",
    value: "20 days",
    description: "Time for an employee to reach key milestones with AI-guided onboarding.",
    type: "time",
  });

  const [productivityData] = useState<ProductivityData>({
    automated: 10,
    manual: 0,
  });

  const [nudgeThemes] = useState<NudgeTheme[]>([
    { id: "1", label: "Ticket debugging", category: "support" },
    { id: "2", label: "Ticket debugging", category: "support" },
    { id: "3", label: "Ticket debugging", category: "support" },
    { id: "4", label: "Ticket debugging", category: "support" },
    { id: "5", label: "Ticket debugging", category: "support" },
    { id: "6", label: "Ticket debugging", category: "support" },
  ]);

  // Fetch admin data from APIs
  const fetchAdminData = async () => {
    if (!user || user.role !== "admin") return;

    setLoading(true);
    setError(null);

    try {
      // Fetch all admin data in parallel
      const [integrationsData, usersData, templatesData] = await Promise.all([
        fetchIntegrations().catch(() => []),
        fetchUsers().catch(() => []),
        fetchTemplates().catch(() => []),
      ]);

      setIntegrations(integrationsData);
      setUsers(usersData);
      setTemplates(templatesData);
    } catch (err) {
      console.error("Error fetching admin data:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch admin data");
    } finally {
      setLoading(false);
    }
  };

  // Fetch data when user logs in (only for admin users)
  useEffect(() => {
    if (user && user.role === "admin") {
      fetchAdminData();
    }
  }, [user]);

  const refetchData = () => {
    fetchAdminData();
  };

  const connectIntegration = (id: string, token?: string) => {
    if (token) {
      console.log(`Connecting integration ${id} with token:`, token);
      // TODO: Send token to backend API for validation and storage
    }
    // Don't update local state - let backend be source of truth
    // Integration status will update via polling or manual refetch
  };

  const disconnectIntegration = async (id: string) => {
    // Call backend disconnect endpoint (already implemented for Slack)
    // Status will be updated when we refetch
    console.log(`Disconnect integration: ${id}`);
    // Trigger refetch to get actual status from backend
    await fetchAdminData();
  };

  const configureIntegration = (id: string) => {
    // Placeholder for configuration modal/flow
    console.log("Configure integration:", id);
    // TODO: Open configuration modal or settings panel
  };

  const syncIntegration = async (id: string) => {
    const integration = integrations.find((i) => i.id === id);

    if (!integration) {
      console.error("Integration not found:", id);
      return;
    }

    // Only Slack sync is implemented for now
    if (integration.provider !== "slack") {
      console.log("Sync not yet implemented for:", integration.provider);
      return;
    }

    try {
      console.log("🔄 Starting Slack sync...");

      const token = authService.getAccessToken();
      if (!token) {
        throw new Error("Not authenticated. Please log in again.");
      }

      const response = await fetch("http://localhost:3000/api/integrations/slack/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Sync failed");
      }

      const result = await response.json();
      console.log("✅ Sync completed:", result);

      // Refresh integrations to update lastSyncedAt
      await fetchAdminData();

      // Show success message (you can add a toast here)
      alert(
        `✅ Sync Complete!\n\n` +
          `Messages Embedded: ${result.messagesEmbedded}\n` +
          `Channels Processed: ${result.channelsProcessed}\n` +
          `Duration: ${(result.duration / 1000).toFixed(2)}s`
      );
    } catch (error) {
      console.error("❌ Sync failed:", error);
      alert(`❌ Sync Failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const viewIntegrationDetails = (id: string) => {
    // Placeholder for details view
    console.log("View integration details:", id);
    // TODO: Open details panel or modal
  };

  return (
    <AdminContext.Provider
      value={{
        integrations,
        users,
        templates,
        loading,
        error,
        connectIntegration,
        disconnectIntegration,
        configureIntegration,
        syncIntegration,
        viewIntegrationDetails,
        savingsMetric,
        timeToProductivity,
        productivityData,
        nudgeThemes,
        refetchData,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error("useAdmin must be used within an AdminProvider");
  }
  return context;
}
