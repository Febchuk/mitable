/**
 * @deprecated Integrations tab no longer in use. Local-first app does not use
 * cloud integrations. This file is scheduled for deletion.
 */
/**
 * @deprecated Integrations tab no longer in use. Local-first app does not use
 * cloud integrations. This file is scheduled for deletion.
 */
import { useState, useEffect, useRef } from "react";
import { useIntegrations, useSyncIntegration } from "@/console/src/hooks/queries/admin";
import IntegrationCard from "./components/IntegrationCard";
import { createLogger } from "../../../../../../lib/logger";

const logger = createLogger("IntegrationsView");
import SlackConnectDialog from "./components/SlackConnectDialog";
import SlackConfigureDialog from "./components/SlackConfigureDialog";
import NotionConnectDialog from "./components/NotionConnectDialog";
import NotionConfigureDialog from "./components/NotionConfigureDialog";
import GitHubConnectDialog from "./components/GitHubConnectDialog";
import LinearUsersDialog from "./components/LinearUsersDialog";
import GmailUsersDialog from "./components/GmailUsersDialog";
import GmailConfigureDialog from "./components/GmailConfigureDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Search, Filter, Plus } from "lucide-react";
import { authService } from "@/console/src/services/authService";
import { API_BASE_URL } from "@/console/src/lib/config";

// Polling configuration for OAuth callback
const POLLING_CONFIG = {
  INTERVAL_MS: 1000, // Poll every 1 second
  MAX_POLLS: 120, // Maximum 120 polls (2 minutes timeout)
  UI_DELAY_MS: 500, // Delay before opening configure dialog
} as const;

export default function IntegrationsView() {
  const { data: integrations = [], refetch } = useIntegrations();
  const syncMutation = useSyncIntegration();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [slackDialogOpen, setSlackDialogOpen] = useState(false);
  const [slackConfigureDialogOpen, setSlackConfigureDialogOpen] = useState(false);
  const [notionDialogOpen, setNotionDialogOpen] = useState(false);
  const [notionConfigureDialogOpen, setNotionConfigureDialogOpen] = useState(false);
  const [githubDialogOpen, setGithubDialogOpen] = useState(false);
  const [linearUsersDialogOpen, setLinearUsersDialogOpen] = useState(false);
  const [gmailUsersDialogOpen, setGmailUsersDialogOpen] = useState(false);
  const [gmailConfigureDialogOpen, setGmailConfigureDialogOpen] = useState(false);
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

  const handleLinearViewUsers = () => {
    setLinearUsersDialogOpen(true);
  };

  const handleGmailViewUsers = () => {
    setGmailUsersDialogOpen(true);
  };

  const handleGmailConfigure = () => {
    setGmailConfigureDialogOpen(true);
  };

  const handleGmailConfigureSave = () => {
    // Refresh integrations to get updated metadata
    refetch();
  };

  const handleGithubOAuthComplete = () => {
    // Start polling for GitHub installation completion
    logger.info(" GitHub OAuth complete, starting polling...");

    let pollCount = 0;
    const pollInterval = setInterval(async () => {
      pollCount++;

      if (pollCount > POLLING_CONFIG.MAX_POLLS) {
        clearInterval(pollInterval);
        logger.info(" Polling timeout - stopping");
        toast({
          title: "Timeout",
          description: "GitHub installation check timed out. Please refresh the page.",
          variant: "destructive",
        });
        return;
      }

      try {
        await refetch();
        const githubIntegration = integrations.find((i) => i.provider === "github");

        if (githubIntegration) {
          clearInterval(pollInterval);
          logger.info(" GitHub integration detected!");

          toast({
            title: "Connected",
            description: "GitHub has been connected successfully.",
          });
        }
      } catch (error) {
        logger.error(" Polling error:", error);
      }
    }, POLLING_CONFIG.INTERVAL_MS);

    pollingIntervalRef.current = pollInterval;
  };

  // Stub handlers for IntegrationCard (not used for Slack, but required by component)
  const handleConnectIntegration = async (id: string) => {
    // Generic connect - not used for Slack (uses custom OAuth flow)
    logger.info("Connect integration:", id);
  };

  const handleConfigureIntegration = (id: string) => {
    // Generic configure - not used for Slack (uses custom dialog)
    logger.info("Configure integration:", id);
  };

  const handleSyncIntegration = async (id: string) => {
    try {
      await syncMutation.mutateAsync(id);
      toast({
        title: "Sync Started",
        description: "Integration sync has been triggered successfully.",
      });
    } catch (error) {
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Failed to sync integration",
        variant: "destructive",
      });
    }
  };

  const handleViewDetails = (id: string) => {
    // View details - not implemented yet
    logger.info("View details:", id);
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
      logger.error("Error disconnecting:", error);
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
            logger.error("Auto-sync failed:", error);
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
    <div className="p-8 space-y-6 app-no-drag">
      {/* Header */}
      <div>
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
            className="pl-12 bg-background-elevated border-transparent text-text-primary placeholder:text-text-secondary"
          />
        </div>

        {/* Filter Button */}
        <Button
          variant="outline"
          className="gap-2 bg-background-elevated border-transparent text-text-secondary hover:text-text-primary hover:bg-background-elevated/80"
        >
          <Filter size={20} />
          <span className="font-medium">Filter</span>
        </Button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Add Custom Integration Button */}
        <Button className="gap-2 bg-primary hover:bg-primary/90">
          <Plus className="w-4 h-4" />
          Add Custom Integration
        </Button>
      </div>

      {/* Search Results View - Consolidated List */}
      {isSearching ? (
        <div className="space-y-4 max-w-5xl">
          {sortedIntegrations.length > 0 ? (
            <div className="bg-background-elevated rounded-lg border border-border-subtle overflow-hidden divide-y divide-border-subtle">
              {sortedIntegrations.map((integration, index) => (
                <IntegrationCard
                  key={integration.id}
                  integration={integration}
                  onConnect={handleConnectIntegration}
                  onDisconnect={handleDisconnect}
                  onConfigure={
                    integration.provider === "slack"
                      ? handleSlackConfigure
                      : integration.provider === "linear"
                        ? handleLinearViewUsers
                        : integration.provider === "gmail"
                          ? handleGmailConfigure
                          : handleConfigureIntegration
                  }
                  onSync={
                    integration.provider === "linear" || integration.provider === "gmail"
                      ? undefined
                      : handleSyncIntegration
                  }
                  onViewDetails={handleViewDetails}
                  onCustomConnect={
                    integration.provider === "slack"
                      ? handleSlackConnect
                      : integration.provider === "notion"
                        ? handleNotionConnect
                        : integration.provider === "github"
                          ? handleGithubConnect
                          : integration.provider === "linear"
                            ? handleLinearViewUsers
                            : integration.provider === "gmail"
                              ? handleGmailViewUsers
                              : undefined
                  }
                  position={getCardPosition(index, sortedIntegrations.length)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
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
              <div className="bg-background-elevated rounded-lg border border-border-subtle overflow-hidden divide-y divide-border-subtle">
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
                          : integration.provider === "linear"
                            ? handleLinearViewUsers
                            : integration.provider === "gmail"
                              ? handleGmailConfigure
                              : handleConfigureIntegration
                    }
                    onSync={
                      integration.provider === "linear" || integration.provider === "gmail"
                        ? undefined
                        : handleSyncIntegration
                    }
                    onViewDetails={handleViewDetails}
                    onCustomConnect={
                      integration.provider === "slack"
                        ? handleSlackConnect
                        : integration.provider === "notion"
                          ? handleNotionConnect
                          : integration.provider === "github"
                            ? handleGithubConnect
                            : integration.provider === "linear"
                              ? handleLinearViewUsers
                              : integration.provider === "gmail"
                                ? handleGmailViewUsers
                                : undefined
                    }
                    position={getCardPosition(index, connectedIntegrations.length)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">No connected integrations</p>
            )}
          </div>

          {/* Available Integrations Section */}
          <div className="space-y-4 max-w-5xl">
            <h2 className="text-2xl font-semibold text-white">Available Integrations</h2>
            {availableIntegrations.length > 0 ? (
              <div className="bg-background-elevated rounded-lg border border-border-subtle overflow-hidden divide-y divide-border-subtle">
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
                          : integration.provider === "linear"
                            ? handleLinearViewUsers
                            : integration.provider === "gmail"
                              ? handleGmailConfigure
                              : handleConfigureIntegration
                    }
                    onSync={
                      integration.provider === "linear" || integration.provider === "gmail"
                        ? undefined
                        : handleSyncIntegration
                    }
                    onViewDetails={handleViewDetails}
                    onCustomConnect={
                      integration.provider === "slack"
                        ? handleSlackConnect
                        : integration.provider === "notion"
                          ? handleNotionConnect
                          : integration.provider === "github"
                            ? handleGithubConnect
                            : integration.provider === "linear"
                              ? handleLinearViewUsers
                              : integration.provider === "gmail"
                                ? handleGmailViewUsers
                                : undefined
                    }
                    position={getCardPosition(index, availableIntegrations.length)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
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

      {/* Notion Configure Dialog */}
      <NotionConfigureDialog
        open={notionConfigureDialogOpen}
        onOpenChange={setNotionConfigureDialogOpen}
        onSave={handleNotionConfigureSave}
        onReconnect={handleNotionReconnect}
      />

      {/* GitHub Connect Dialog */}
      <GitHubConnectDialog
        open={githubDialogOpen}
        onOpenChange={setGithubDialogOpen}
        onConnect={handleGithubOAuthComplete}
      />

      {/* Linear Users Dialog */}
      <LinearUsersDialog open={linearUsersDialogOpen} onOpenChange={setLinearUsersDialogOpen} />

      {/* Gmail Users Dialog */}
      <GmailUsersDialog open={gmailUsersDialogOpen} onOpenChange={setGmailUsersDialogOpen} />

      {/* Gmail Configure Dialog */}
      <GmailConfigureDialog
        open={gmailConfigureDialogOpen}
        onOpenChange={setGmailConfigureDialogOpen}
        onSave={handleGmailConfigureSave}
      />
    </div>
  );
}
