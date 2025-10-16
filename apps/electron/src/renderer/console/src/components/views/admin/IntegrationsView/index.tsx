import { useState } from "react";
import { useAdmin } from "@/console/src/context/AdminContext";
import IntegrationCard from "./components/IntegrationCard";
import SlackConnectDialog from "./components/SlackConnectDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Filter, Plus } from "lucide-react";

export default function IntegrationsView() {
  const {
    integrations,
    connectIntegration,
    disconnectIntegration,
    configureIntegration,
    syncIntegration,
    viewIntegrationDetails,
  } = useAdmin();
  const [searchQuery, setSearchQuery] = useState("");
  const [slackDialogOpen, setSlackDialogOpen] = useState(false);

  const handleSlackConnect = () => {
    setSlackDialogOpen(true);
  };

  const handleSlackConnectWithToken = (token: string) => {
    connectIntegration("slack", token);
    setSlackDialogOpen(false);
  };

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
                  onDisconnect={disconnectIntegration}
                  onConfigure={configureIntegration}
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
                    onDisconnect={disconnectIntegration}
                    onConfigure={configureIntegration}
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
                    onDisconnect={disconnectIntegration}
                    onConfigure={configureIntegration}
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
        onConnect={handleSlackConnectWithToken}
      />
    </div>
  );
}
