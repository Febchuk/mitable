import type { Integration } from "../../../../../types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, Link, ChevronDown, Settings, RefreshCw, Info, LogOut } from "lucide-react";
import { getIntegrationIcon } from "@/components/icons/integrations";

interface IntegrationCardProps {
  integration: Integration;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onConfigure?: (id: string) => void;
  onSync?: (id: string) => void;
  onViewDetails?: (id: string) => void;
  onCustomConnect?: () => void;
  position?: "first" | "middle" | "last" | "only";
}

export default function IntegrationCard({
  integration,
  onConnect,
  onDisconnect,
  onConfigure,
  onSync,
  onViewDetails,
  onCustomConnect,
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
    <Card
      className={`flex items-center gap-4 p-6 bg-[#0f0d15] hover:bg-[#1a1625] border-0 transition-colors ${radiusClasses[position]}`}
    >
      {/* Integration Icon */}
      <div className="flex-shrink-0">
        <IconComponent />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-lg font-semibold text-white">{integration.name}</h3>
        </div>
        <p className="text-sm text-text-secondary">{integration.description}</p>
      </div>

      {/* Action Button */}
      {isConnected ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="bg-status-success hover:bg-status-success/90 text-white gap-2">
              <Check className="w-4 h-4" />
              Connected
              <ChevronDown className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {onConfigure && (
              <DropdownMenuItem onClick={() => onConfigure(integration.id)}>
                <Settings className="w-4 h-4" />
                Configure
              </DropdownMenuItem>
            )}
            {onSync && (
              <DropdownMenuItem onClick={() => onSync(integration.id)}>
                <RefreshCw className="w-4 h-4" />
                Sync Now
              </DropdownMenuItem>
            )}
            {onViewDetails && (
              <DropdownMenuItem onClick={() => onViewDetails(integration.id)}>
                <Info className="w-4 h-4" />
                View Details
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDisconnect(integration.id)}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="w-4 h-4" />
              Disconnect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button
          variant="default"
          onClick={() => (onCustomConnect ? onCustomConnect() : onConnect(integration.id))}
          className="bg-primary hover:bg-primary/90 gap-2"
        >
          <Link className="w-4 h-4" />
          Connect
        </Button>
      )}
    </Card>
  );
}
