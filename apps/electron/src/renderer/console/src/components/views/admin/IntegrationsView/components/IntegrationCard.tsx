import type { Integration } from "../../../../../types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Link } from "lucide-react";

interface IntegrationCardProps {
  integration: Integration;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  position?: "first" | "middle" | "last" | "only";
}

// Icon components with proper styling matching Figma
const SlackIcon = () => (
  <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"
        fill="#E01E5A"
      />
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52z" fill="#E01E5A" />
      <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834z" fill="#36C5F0" />
      <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834z" fill="#2EB67D" />
      <path d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52z" fill="#ECB22E" />
    </svg>
  </div>
);

const NotionIcon = () => (
  <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466l1.823 1.447zm.466 2.336v13.588c0 .746.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.84zm14.336.746c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933l3.129-.187zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z"
        fill="#000"
      />
    </svg>
  </div>
);

const CodebaseIcon = () => (
  <div className="w-12 h-12 bg-[#2B7EE3] rounded-lg flex items-center justify-center">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  </div>
);

const GoogleDriveIcon = () => (
  <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M8.25 8.5L12 1.5L15.75 8.5" fill="#0066DA" />
      <path d="M15.75 8.5L19.5 15.5H12L8.25 8.5" fill="#00AC47" />
      <path d="M4.5 15.5L8.25 8.5L12 15.5" fill="#EA4335" />
      <path d="M8.25 8.5H15.75L12 15.5H4.5" fill="#00832D" />
      <path d="M12 15.5L15.75 8.5H8.25" fill="#2684FC" />
      <path d="M12 15.5L8.25 22.5H15.75" fill="#FFBA00" />
    </svg>
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

  return (
    <Card className={`flex items-center gap-4 p-6 bg-integration-card border-0 ${radiusClasses[position]}`}>
      {/* Integration Icon */}
      <div className="flex-shrink-0">{getIntegrationIcon(integration.provider)}</div>

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
