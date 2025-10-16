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
    setIntegrations((prev) =>
      prev.map((integration) =>
        integration.id === id
          ? { ...integration, status: "connected" as const, connectedAt: new Date() }
          : integration
      )
    );
  };

  const disconnectIntegration = (id: string) => {
    setIntegrations((prev) =>
      prev.map((integration) =>
        integration.id === id
          ? { ...integration, status: "disconnected" as const, connectedAt: undefined }
          : integration
      )
    );
  };

  const configureIntegration = (id: string) => {
    // Placeholder for configuration modal/flow
    console.log("Configure integration:", id);
    // TODO: Open configuration modal or settings panel
  };

  const syncIntegration = (id: string) => {
    // Placeholder for sync trigger
    console.log("Sync integration:", id);
    // TODO: Trigger sync API call
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
