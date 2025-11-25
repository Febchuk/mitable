import { useState, useEffect, useRef } from "react";
import { useIntegrations } from "@/console/src/hooks/queries/admin";
import IntegrationCard from "./components/IntegrationCard";
import SlackConnectDialog from "./components/SlackConnectDialog";
import SlackConfigureDialog from "./components/SlackConfigureDialog";
import NotionConnectDialog from "./components/NotionConnectDialog";
import NotionConfigureDialog from "./components/NotionConfigureDialog";
import GitHubConnectDialog from "./components/GitHubConnectDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Search, Filter } from "lucide-react";
import { authService } from "@/console/src/services/authService";
import logoIconSvg from "../../../../../../assets/logo-icon.svg";

// Polling configuration for OAuth callback
const POLLING_CONFIG = {
  INTERVAL_MS: 1000, // Poll every 1 second
  MAX_POLLS: 120, // Maximum 120 polls (2 minutes timeout)
  UI_DELAY_MS: 500, // Delay before opening configure dialog
} as const;

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function IntegrationsView() {
  const { data: integrations = [], refetch } = useIntegrations();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [slackDialogOpen, setSlackDialogOpen] = useState(false);
  const [slackConfigureDialogOpen, setSlackConfigureDialogOpen] = useState(false);
  const [notionDialogOpen, setNotionDialogOpen] = useState(false);
  const [notionConfigureDialogOpen, setNotionConfigureDialogOpen] = useState(false);
  const [githubDialogOpen, setGithubDialogOpen] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const handleSlackConnect = () => {
    setSlackDialogOpen(true);
  };

  const handleSlackConfigure = () => {
    setSlackConfigureDialogOpen(true);
  };

  const handleSlackConfigureSave = () => {
    // Refresh integrations to get updated metadata
    refetch();
  };

  const handleNotionConnect = () => {
    setNotionDialogOpen(true);
  };

  const handleNotionConfigure = () => {
    setNotionConfigureDialogOpen(true);
  };

  const handleNotionConfigureSave = () => {
    // Refresh integrations to get updated metadata
    refetch();
  };

  const handleNotionReconnect = () => {
    // Close configure dialog and open connect dialog to re-auth
    setNotionConfigureDialogOpen(false);
    setNotionDialogOpen(true);
  };

  const handleGithubConnect = () => {
    setGithubDialogOpen(true);
  };

  // Stub handlers for IntegrationCard (not used for Slack, but required by component)
  const handleConnectIntegration = async (id: string) => {
    // Generic connect - not used for Slack (uses custom OAuth flow)
    console.log("Connect integration:", id);
  };

  const handleConfigureIntegration = (id: string) => {
    // Generic configure - not used for Slack (uses custom dialog)
    console.log("Configure integration:", id);
  };

  const handleSyncIntegration = async (id: string) => {
    const integration = integrations.find((i) => i.id === id);
    if (!integration) return;

    try {
      const token = authService.getAccessToken();
      if (!token) {
        toast({
          title: "Error",
          description: "Not authenticated. Please log in again.",
          variant: "destructive",
        });
        return;
      }

      // Call provider-specific sync endpoint
      let endpoint = "";
      if (integration.provider === "slack") {
        endpoint = `${API_BASE_URL}/api/integrations/slack/sync`;
      } else if (integration.provider === "notion") {
        endpoint = `${API_BASE_URL}/api/integrations/notion/sync`;
      } else if (integration.provider === "github") {
        endpoint = `${API_BASE_URL}/api/integrations/github/sync`;
      }

      if (endpoint) {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Sync failed");
        }

        const result = await response.json();
        
        toast({
          title: "Sync Complete",
          description: integration.provider === "github" 
            ? `Processed ${result.commitsProcessed || 0} commits from ${result.reposProcessed || 0} repositories`
            : "Integration sync completed successfully.",
        });

        // Refresh integrations to update lastSyncedAt
        await refetch();
      }
    } catch (error) {
      console.error("Sync error:", error);
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Failed to sync integration",
        variant: "destructive",
      });
    }
  };

  const handleViewDetails = (id: string) => {
    // View details - not implemented yet
    console.log("View details:", id);
  };

  const handleDisconnect = async (id: string) => {
    const integration = integrations.find((i) => i.id === id);
    if (!integration) return;

    // Show confirmation dialog
    const confirmed = window.confirm(
      `Disconnect ${integration.name}?\n\n` +
        `This will remove all credentials and stop syncing data from ${integration.name}.`
    );

    if (!confirmed) return;

    try {
      const token = authService.getAccessToken();
      if (!token) {
        toast({
          title: "Error",
          description: "Not authenticated. Please log in again.",
          variant: "destructive",
        });
        return;
      }

      // Call backend disconnect endpoint
      let endpoint = "";
      if (integration.provider === "slack") {
        endpoint = `${API_BASE_URL}/api/integrations/slack/disconnect`;
      } else if (integration.provider === "notion") {
        endpoint = `${API_BASE_URL}/api/integrations/notion/disconnect`;
      } else if (integration.provider === "github") {
        endpoint = `${API_BASE_URL}/api/integrations/github/disconnect`;
      }

      if (endpoint) {
        const response = await fetch(endpoint, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Failed to disconnect");
        }

        toast({
          title: "Disconnected",
          description: `${integration.name} has been disconnected successfully.`,
        });
      }

      // Refresh to show updated status
      await refetch();
    } catch (error) {
      console.error("Error disconnecting:", error);
      toast({
        title: "Error",
        description: `Failed to disconnect ${integration.name}. Please try again.`,
        variant: "destructive",
      });
    }
  };

  const handleSlackOAuthStarted = () => {
    // Start polling for connection status after OAuth window opens

    // Poll every 1 second for up to 2 minutes
    let pollCount = 0;
    const maxPolls = POLLING_CONFIG.MAX_POLLS;

    pollingIntervalRef.current = setInterval(async () => {
      pollCount++;

      // Refresh integrations to check if Slack is connected
      await refetch();

      const slackIntegration = integrations.find((i) => i.provider === "slack");

      if (slackIntegration?.status === "connected") {
        // Success! Stop polling
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }

        // Show success notification
        toast({
          title: "Slack Connected",
          description: "Your Slack workspace has been connected successfully!",
        });

        // Auto-open configure dialog
        setTimeout(() => {
          setSlackConfigureDialogOpen(true);
        }, POLLING_CONFIG.UI_DELAY_MS);
      } else if (pollCount >= maxPolls) {
        // Timeout - stop polling
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }
    }, POLLING_CONFIG.INTERVAL_MS);
  };

  const handleNotionOAuthStarted = () => {
    // Start polling for connection status after OAuth window opens
    let pollCount = 0;
    const maxPolls = 120; // 2 minutes

    pollingIntervalRef.current = setInterval(async () => {
      pollCount++;

      // Refresh integrations to check if Notion is connected
      await refetch();

      const notionIntegration = integrations.find((i) => i.provider === "notion");

      if (notionIntegration?.status === "connected") {
        // Success! Stop polling
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }

        // Show success notification
        toast({
          title: "Notion Connected",
          description: "Your Notion workspace has been connected successfully!",
        });

        // Auto-trigger sync (Notion doesn't need configure step)
        setTimeout(async () => {
          try {
            const token = authService.getAccessToken();
            if (token) {
              await fetch(`${API_BASE_URL}/api/integrations/notion/sync`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
              });
            }
          } catch (error) {
            console.error("Auto-sync failed:", error);
          }
        }, 1000);
      } else if (pollCount >= maxPolls) {
        // Timeout - stop polling
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }
    }, 1000);
  };

  const handleGithubOAuthStarted = () => {
    let pollCount = 0;
    const maxPolls = POLLING_CONFIG.MAX_POLLS;

    pollingIntervalRef.current = setInterval(async () => {
      pollCount++;

      await refetch();

      const githubIntegration = integrations.find((i) => i.provider === "github");

      if (githubIntegration?.status === "connected") {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }

        toast({
          title: "GitHub Connected",
          description: "Your GitHub installation is complete.",
        });
      } else if (pollCount >= maxPolls) {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }
    }, POLLING_CONFIG.INTERVAL_MS);
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Filter integrations based on search query
  const filteredIntegrations = integrations.filter((integration) => {
    const query = searchQuery.toLowerCase();
    return (
      integration.name.toLowerCase().includes(query) ||
      integration.description.toLowerCase().includes(query)
    );
  });

  // Detect if user is actively searching
  const isSearching = searchQuery.trim() !== "";

  // Split into connected and available (for non-search view)
  const connectedIntegrations = filteredIntegrations.filter(
    (integration) => integration.status === "connected"
  );
  const availableIntegrations = filteredIntegrations.filter(
    (integration) => integration.status !== "connected"
  );

  // Sort integrations for search view (connected first)
  const sortedIntegrations = [...filteredIntegrations].sort((a, b) => {
    if (a.status === "connected" && b.status !== "connected") return -1;
    if (a.status !== "connected" && b.status === "connected") return 1;
    return 0;
  });

  // Helper function to determine card position
  const getCardPosition = (
    index: number,
    totalLength: number
  ): "first" | "middle" | "last" | "only" => {
    if (totalLength === 1) return "only";
    if (index === 0) return "first";
    if (index === totalLength - 1) return "last";
    return "middle";
  };

  return (
    <div className="h-screen overflow-y-auto bg-[#0a0810] custom-scrollbar">
      <div className="max-w-7xl mx-auto p-8 space-y-6 app-no-drag">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <img src={logoIconSvg} alt="Mitable" className="w-10 h-10" />
        <h1 className="text-4xl font-bold text-white">Integrations</h1>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-4 max-w-5xl">
        {/* Search Bar */}
        <div className="flex-1 relative">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
            size={20}
          />
          <Input
            type="text"
            placeholder="Search integrations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 bg-[#1a1625] border-primary/20 text-white placeholder:text-text-tertiary"
          />
        </div>

        {/* Filter Button */}
        <Button
          variant="outline"
          className="gap-2 bg-[#1a1625] border-primary/20 text-text-secondary hover:text-white hover:bg-[#231d2e]"
        >
          <Filter size={20} />
          <span className="font-medium">Filter</span>
        </Button>
      </div>

      {/* Search Results View - Consolidated List */}
      {isSearching ? (
        <div className="space-y-4 max-w-5xl">
          {sortedIntegrations.length > 0 ? (
            <div className="bg-[#1a1625] rounded-xl border border-primary/20 overflow-hidden divide-y divide-primary/10">
              {sortedIntegrations.map((integration, index) => (
                <IntegrationCard
                  key={integration.id}
                  integration={integration}
                  onConnect={handleConnectIntegration}
                  onDisconnect={handleDisconnect}
                  onConfigure={
                    integration.provider === "slack"
                      ? handleSlackConfigure
                      : handleConfigureIntegration
                  }
                  onSync={handleSyncIntegration}
                  onViewDetails={handleViewDetails}
                  onCustomConnect={
                    integration.provider === "slack"
                      ? handleSlackConnect
                      : integration.provider === "notion"
                        ? handleNotionConnect
                        : integration.provider === "github"
                          ? handleGithubConnect
                          : undefined
                  }
                  position={getCardPosition(index, sortedIntegrations.length)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-text-secondary">
                No integrations found matching "{searchQuery}"
              </p>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Connected Integrations Section */}
          <div className="space-y-4 max-w-5xl">
            <h2 className="text-2xl font-semibold text-white">Connected Integrations</h2>
            {connectedIntegrations.length > 0 ? (
              <div className="bg-[#1a1625] rounded-xl border border-primary/20 overflow-hidden divide-y divide-primary/10">
                {connectedIntegrations.map((integration, index) => (
                  <IntegrationCard
                    key={integration.id}
                    integration={integration}
                    onConnect={handleConnectIntegration}
                    onDisconnect={handleDisconnect}
                    onConfigure={
                      integration.provider === "slack"
                        ? handleSlackConfigure
                        : integration.provider === "notion"
                          ? handleNotionConfigure
                          : handleConfigureIntegration
                    }
                    onSync={handleSyncIntegration}
                    onViewDetails={handleViewDetails}
                    onCustomConnect={
                      integration.provider === "slack"
                        ? handleSlackConnect
                        : integration.provider === "notion"
                          ? handleNotionConnect
                          : integration.provider === "github"
                            ? handleGithubConnect
                            : undefined
                    }
                    position={getCardPosition(index, connectedIntegrations.length)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-text-secondary text-center py-8">No connected integrations</p>
            )}
          </div>

          {/* Available Integrations Section */}
          <div className="space-y-4 max-w-5xl">
            <h2 className="text-2xl font-semibold text-white">Available Integrations</h2>
            {availableIntegrations.length > 0 ? (
              <div className="bg-[#1a1625] rounded-xl border border-primary/20 overflow-hidden divide-y divide-primary/10">
                {availableIntegrations.map((integration, index) => (
                  <IntegrationCard
                    key={integration.id}
                    integration={integration}
                    onConnect={handleConnectIntegration}
                    onDisconnect={handleDisconnect}
                    onConfigure={
                      integration.provider === "slack"
                        ? handleSlackConfigure
                        : integration.provider === "notion"
                          ? handleNotionConfigure
                          : handleConfigureIntegration
                    }
                    onSync={handleSyncIntegration}
                    onViewDetails={handleViewDetails}
                    onCustomConnect={
                      integration.provider === "slack"
                        ? handleSlackConnect
                        : integration.provider === "notion"
                          ? handleNotionConnect
                          : integration.provider === "github"
                            ? handleGithubConnect
                            : undefined
                    }
                    position={getCardPosition(index, availableIntegrations.length)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-text-secondary text-center py-8">
                No more available integrations
              </p>
            )}
          </div>
        </>
      )}

      {/* Slack Connect Dialog */}
      <SlackConnectDialog
        open={slackDialogOpen}
        onOpenChange={setSlackDialogOpen}
        onConnect={handleSlackOAuthStarted}
      />

      {/* Slack Configure Dialog */}
      <SlackConfigureDialog
        open={slackConfigureDialogOpen}
        onOpenChange={setSlackConfigureDialogOpen}
        onSave={handleSlackConfigureSave}
      />

      {/* Notion Connect Dialog */}
      <NotionConnectDialog
        open={notionDialogOpen}
        onOpenChange={setNotionDialogOpen}
        onConnect={handleNotionOAuthStarted}
      />

      {/* GitHub Connect Dialog */}
      <GitHubConnectDialog
        open={githubDialogOpen}
        onOpenChange={setGithubDialogOpen}
        onConnect={handleGithubOAuthStarted}
      />

      {/* Notion Configure Dialog */}
      <NotionConfigureDialog
        open={notionConfigureDialogOpen}
        onOpenChange={setNotionConfigureDialogOpen}
        onSave={handleNotionConfigureSave}
        onReconnect={handleNotionReconnect}
      />
      </div>
    </div>
  );
}
