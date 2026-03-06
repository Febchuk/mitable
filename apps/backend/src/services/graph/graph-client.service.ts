import { config } from "../../config";
import { createLogger } from "../../lib/logger";

const logger = createLogger({ context: "graph-client" });

class GraphClientService {
  isEnabled(): boolean {
    return config.graph.enabled;
  }

  getDatabaseName(): string {
    return config.graph.database;
  }

  async healthCheck(): Promise<boolean> {
    if (!this.isEnabled()) return false;

    // Neo4j transport will be implemented in the next iteration.
    // For now, this gates graph features with explicit config flags.
    logger.debug({ uri: config.graph.uri }, "Graph health check stub executed");
    return true;
  }
}

export const graphClientService = new GraphClientService();
