import { useState, useEffect, useRef } from "react";
import { useAdmin } from "@/console/src/context/AdminContext";
import IntegrationCard from "./components/IntegrationCard";
import SlackConnectDialog from "./components/SlackConnectDialog";
import SlackConfigureDialog from "./components/SlackConfigureDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Filter, Plus } from "lucide-react";
import { authService } from "@/console/src/services/authService";

export default function IntegrationsView() {
  const {
    integrations,
    connectIntegration,
    configureIntegration,
    syncIntegration,
    viewIntegrationDetails,
    refetchData,
  } = useAdmin();
  const [searchQuery, setSearchQuery] = useState("");
  const [slackDialogOpen, setSlackDialogOpen] = useState(false);
  const [slackConfigureDialogOpen, setSlackConfigureDialogOpen] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const handleSlackConnect = () => {
    setSlackDialogOpen(true);
  };

  const handleSlackConfigure = () => {
    setSlackConfigureDialogOpen(true);
  };

  const handleSlackConfigureSave = () => {
    // Refresh integrations to get updated metadata
    refetchData();
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
        alert("Not authenticated. Please log in again.");
        return;
      }

      // Call backend disconnect endpoint (currently only Slack is implemented)
      if (integration.provider === "slack") {
        const response = await fetch(`http://localhost:3000/api/integrations/slack/disconnect`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Failed to disconnect");
        }

        console.log(`✅ ${integration.name} disconnected`);
      }

      // Refresh to show updated status
      await refetchData();
    } catch (error) {
      console.error("Error disconnecting:", error);
      alert(`Failed to disconnect ${integration.name}. Please try again.`);
    }
  };

  const handleSlackOAuthStarted = () => {
    // Start polling for connection status after OAuth window opens
    
    // Poll every 1 second for up to 2 minutes
    let pollCount = 0;
    const maxPolls = 120; // 2 minutes (120 polls at 1 second each)

    pollingIntervalRef.current = setInterval(async () => {
      pollCount++;

      // Refresh integrations to check if Slack is connected
      await refetchData();

      const slackIntegration = integrations.find((i) => i.provider === "slack");
      
      if (slackIntegration?.status === "connected") {
        // Success! Stop polling
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        
        // Show success notification
        console.log("✅ Slack connected successfully!");
        
        // Auto-open configure dialog
        setTimeout(() => {
          setSlackConfigureDialogOpen(true);
        }, 500); // Small delay to ensure UI is ready
      } else if (pollCount >= maxPolls) {
        // Timeout - stop polling
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }
    }, 1000); // Poll every 1 second instead of 2
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
                  onConnect={connectIntegration}
                  onDisconnect={handleDisconnect}
                  onConfigure={integration.provider === "slack" ? handleSlackConfigure : configureIntegration}
                  onSync={syncIntegration}
                  onViewDetails={viewIntegrationDetails}
                  onCustomConnect={
                    integration.provider === "slack" ? handleSlackConnect : undefined
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
                    onConnect={connectIntegration}
                    onDisconnect={handleDisconnect}
                    onConfigure={integration.provider === "slack" ? handleSlackConfigure : configureIntegration}
                    onSync={syncIntegration}
                    onViewDetails={viewIntegrationDetails}
                    onCustomConnect={
                      integration.provider === "slack" ? handleSlackConnect : undefined
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
                    onConnect={connectIntegration}
                    onDisconnect={handleDisconnect}
                    onConfigure={integration.provider === "slack" ? handleSlackConfigure : configureIntegration}
                    onSync={syncIntegration}
                    onViewDetails={viewIntegrationDetails}
                    onCustomConnect={
                      integration.provider === "slack" ? handleSlackConnect : undefined
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
    </div>
  );
}
