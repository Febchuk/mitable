import type { Integration } from "../../types";

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
    <div className="bg-[#2A2A2A] rounded-xl p-6 flex items-start gap-4 border border-[#3A3A3A]">
      {/* Integration Icon */}
      {getIntegrationIcon(integration.provider)}

      {/* Content */}
      <div className="flex-1">
        <h3 className="text-white font-semibold text-lg mb-1">{integration.name}</h3>
        <p className="text-text-secondary text-sm">{integration.description}</p>
      </div>

      {/* Connect Button */}
      <button
        onClick={() => (isConnected ? onDisconnect(integration.id) : onConnect(integration.id))}
        className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${
          isConnected
            ? "bg-[#3A3A3A] text-text-secondary hover:bg-[#4A4A4A]"
            : "bg-primary text-white hover:bg-primary-hover"
        }`}
      >
        {isConnected ? "Connected" : "Connect"}
      </button>
    </div>
  );
}
