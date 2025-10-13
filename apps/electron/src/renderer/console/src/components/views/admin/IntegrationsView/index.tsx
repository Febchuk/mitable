import { useAdmin } from "../../../../context/AdminContext";
import IntegrationCard from "./components/IntegrationCard";

export default function IntegrationsView() {
  const { integrations, connectIntegration, disconnectIntegration } = useAdmin();

  return (
    <div className="p-8 space-y-6 app-no-drag">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-white">Integrations</h1>
      </div>

      {/* Integration Cards */}
      <div className="space-y-4 max-w-3xl">
        {integrations.map((integration) => (
          <IntegrationCard
            key={integration.id}
            integration={integration}
            onConnect={connectIntegration}
            onDisconnect={disconnectIntegration}
          />
        ))}
      </div>
    </div>
  );
}
