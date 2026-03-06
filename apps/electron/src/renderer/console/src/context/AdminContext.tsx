import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { DashboardMetric, ProductivityData } from "../types";
import {
  fetchIntegrations,
  fetchUsers,
  type User,
  type Integration,
} from "../services/adminService";
import { authService } from "../services/authService";
import { useUser } from "./UserContext";
import { createLogger } from "../../../lib/logger";
import { API_BASE_URL } from "../lib/config";

const logger = createLogger("AdminContext");

interface AdminContextType {
  integrations: Integration[];
  users: User[];
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
  refetchData: () => void;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [savingsMetric] = useState<DashboardMetric>({
    label: "Total Savings",
    value: "$50,000",
    description:
      "Cost savings from AI-powered work insights, helping employees understand time allocation and productivity.",
    type: "currency",
  });

  const [timeToProductivity] = useState<DashboardMetric>({
    label: "Time to Productivity",
    value: "20 days",
    description: "Average time for employees to reach peak productivity with AI-powered insights.",
    type: "time",
  });

  const [productivityData] = useState<ProductivityData>({
    automated: 10,
    manual: 0,
  });

  // Fetch admin data from APIs
  const fetchAdminData = async () => {
    if (!user || user.role !== "admin") return;

    setLoading(true);
    setError(null);

    try {
      // Fetch all admin data in parallel
      const [integrationsData, usersData] = await Promise.all([
        fetchIntegrations().catch(() => []),
        fetchUsers().catch(() => []),
      ]);

      setIntegrations(integrationsData);
      setUsers(usersData);
    } catch (err) {
      logger.error("Error fetching admin data:", err);
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
      logger.info(`Connecting integration ${id} with token:`, token);
      // TODO: Send token to backend API for validation and storage
    }
    // Don't update local state - let backend be source of truth
    // Integration status will update via polling or manual refetch
  };

  const disconnectIntegration = async (id: string) => {
    // Call backend disconnect endpoint (already implemented for Slack)
    // Status will be updated when we refetch
    logger.info(`Disconnect integration: ${id}`);
    // Trigger refetch to get actual status from backend
    await fetchAdminData();
  };

  const configureIntegration = (id: string) => {
    // Placeholder for configuration modal/flow
    logger.info("Configure integration:", id);
    // TODO: Open configuration modal or settings panel
  };

  const syncIntegration = async (id: string) => {
    const integration = integrations.find((i) => i.id === id);

    if (!integration) {
      logger.error("Integration not found:", id);
      return;
    }

    // Only Slack sync is implemented for now
    if (integration.provider !== "slack") {
      logger.info("Sync not yet implemented for:", integration.provider);
      return;
    }

    try {
      logger.info("Starting Slack sync...");

      const token = authService.getAccessToken();
      if (!token) {
        throw new Error("Not authenticated. Please log in again.");
      }

      const response = await fetch(`${API_BASE_URL}/api/integrations/slack/sync`, {
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
      logger.info("Sync completed:", result);

      // Refresh integrations to update lastSyncedAt
      await fetchAdminData();

      // Show success message (you can add a toast here)
      alert(
        `Sync Complete!\n\n` +
          `Messages Embedded: ${result.messagesEmbedded}\n` +
          `Channels Processed: ${result.channelsProcessed}\n` +
          `Duration: ${(result.duration / 1000).toFixed(2)}s`
      );
    } catch (error) {
      logger.error("Sync failed:", error);
      alert(`Sync Failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const viewIntegrationDetails = (id: string) => {
    // Placeholder for details view
    logger.info("View integration details:", id);
    // TODO: Open details panel or modal
  };

  return (
    <AdminContext.Provider
      value={{
        integrations,
        users,
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
