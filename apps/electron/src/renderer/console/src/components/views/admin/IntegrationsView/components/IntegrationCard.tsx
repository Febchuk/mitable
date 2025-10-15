import type { Integration } from "../../../../../types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Link } from "lucide-react";
import { getIntegrationIcon } from "@/components/icons/integrations";

interface IntegrationCardProps {
  integration: Integration;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  position?: "first" | "middle" | "last" | "only";
}

export default function IntegrationCard({
  integration,
  onConnect,
  onDisconnect,
  position = "only",
}: IntegrationCardProps) {
  const isConnected = integration.status === "connected";

  // Apply conditional border radius based on position
  const radiusClasses = {
    first: "rounded-t-lg rounded-b-none",
    middle: "rounded-none",
    last: "rounded-b-lg rounded-t-none",
    only: "rounded-lg",
  };

  // Get the appropriate icon component
  const IconComponent = getIntegrationIcon(integration.provider);

  return (
    <Card className={`flex items-center gap-4 p-6 bg-integration-card border-0 ${radiusClasses[position]}`}>
      {/* Integration Icon */}
      <div className="flex-shrink-0">
        <IconComponent />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-lg font-semibold text-white">{integration.name}</h3>
          {isConnected && (
            <Badge className="bg-green-600/20 text-green-400 border-green-600/30 hover:bg-green-600/20">
              <Check className="w-3 h-3 mr-1" />
              Connected
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{integration.description}</p>
      </div>

      {/* Action Button */}
      <Button
        variant={isConnected ? "secondary" : "default"}
        onClick={() => (isConnected ? onDisconnect(integration.id) : onConnect(integration.id))}
        className={
          isConnected
            ? ""
            : "bg-primary hover:bg-primary/90"
        }
      >
        {isConnected ? (
          "Disconnect"
        ) : (
          <>
            <Link className="w-4 h-4 mr-2" />
            Connect
          </>
        )}
      </Button>
    </Card>
  );
}
