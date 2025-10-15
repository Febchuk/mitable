import { createContext, useContext, useState, ReactNode } from "react";
import type { Integration, DashboardMetric, ProductivityData, NudgeTheme } from "../types";

interface AdminContextType {
  integrations: Integration[];
  connectIntegration: (id: string) => void;
  disconnectIntegration: (id: string) => void;
  configureIntegration: (id: string) => void;
  syncIntegration: (id: string) => void;
  viewIntegrationDetails: (id: string) => void;
  savingsMetric: DashboardMetric;
  timeToProductivity: DashboardMetric;
  productivityData: ProductivityData;
  nudgeThemes: NudgeTheme[];
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [integrations, setIntegrations] = useState<Integration[]>([
    {
      id: "1",
      provider: "slack",
      name: "Slack",
      description: "Get channel and DM message data. Updates four times a day.",
      status: "connected",
      updatesPerDay: 4,
      connectedAt: new Date(),
    },
    {
      id: "2",
      provider: "notion",
      name: "Notion",
      description: "Get page and database data. Updates four times a day.",
      status: "connected",
      updatesPerDay: 4,
      connectedAt: new Date(),
    },
    {
      id: "3",
      provider: "github",
      name: "GitHub",
      description: "Connect your repositories and pull requests. Updates once a day.",
      status: "disconnected",
      updatesPerDay: 1,
    },
    {
      id: "4",
      provider: "google-drive",
      name: "Google Drive",
      description: "Access your files and documents. Updates once a day.",
      status: "disconnected",
      updatesPerDay: 1,
    },
  ]);

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

  const connectIntegration = (id: string) => {
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
        connectIntegration,
        disconnectIntegration,
        configureIntegration,
        syncIntegration,
        viewIntegrationDetails,
        savingsMetric,
        timeToProductivity,
        productivityData,
        nudgeThemes,
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
