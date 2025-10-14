import type { Integration } from "../../../../../types";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface IntegrationCardProps {
  integration: Integration;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
}

// Placeholder icon components
const SlackIcon = () => (
  <div className="w-12 h-12 bg-[#4A154B] rounded-lg flex items-center justify-center text-white font-bold text-xl">
    S
  </div>
);

const NotionIcon = () => (
  <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center text-black font-bold text-xl">
    N
  </div>
);

const CodebaseIcon = () => (
  <div className="w-12 h-12 bg-[#2B7EE3] rounded-lg flex items-center justify-center text-white font-bold text-xl">
    C
  </div>
);

const GoogleDriveIcon = () => (
  <div className="w-12 h-12 bg-[#4285F4] rounded-lg flex items-center justify-center text-white font-bold text-xl">
    G
  </div>
);

const getIntegrationIcon = (provider: Integration["provider"]) => {
  switch (provider) {
    case "slack":
      return <SlackIcon />;
    case "notion":
      return <NotionIcon />;
    case "codebase":
      return <CodebaseIcon />;
    case "google-drive":
      return <GoogleDriveIcon />;
    default:
      return <SlackIcon />;
  }
};

export default function IntegrationCard({
  integration,
  onConnect,
  onDisconnect,
}: IntegrationCardProps) {
  const isConnected = integration.status === "connected";

  return (
    <Card className="flex items-start gap-4 p-6">
      {/* Integration Icon */}
      <div className="flex-shrink-0">{getIntegrationIcon(integration.provider)}</div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <CardHeader className="p-0 space-y-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{integration.name}</CardTitle>
            {isConnected && (
              <Badge variant="outline" className="text-xs">
                Connected
              </Badge>
            )}
          </div>
          <CardDescription>{integration.description}</CardDescription>
        </CardHeader>
      </div>

      {/* Connect Button */}
      <Button
        variant={isConnected ? "secondary" : "default"}
        onClick={() => (isConnected ? onDisconnect(integration.id) : onConnect(integration.id))}
      >
        {isConnected ? "Disconnect" : "Connect"}
      </Button>
    </Card>
  );
}
