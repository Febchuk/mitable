import neo4j, { type Driver, type Session } from "neo4j-driver";
import { config } from "../../config";
import { createLogger } from "../../domains/shared-infra/lib/logger.js";

const logger = createLogger({ context: "graph-client" });

class GraphClientService {
  private driver: Driver | null = null;

  private getDriver(): Driver {
    if (this.driver) return this.driver;

    const uri = config.graph.uri;
    if (!uri) {
      throw new Error("GRAPH_URI is not configured");
    }

    this.driver = neo4j.driver(uri, neo4j.auth.basic(config.graph.user, config.graph.password));

    return this.driver;
  }

  isEnabled(): boolean {
    return config.graph.enabled;
  }

  getDatabaseName(): string {
    return config.graph.database;
  }

  async runQuery<T = unknown>(
    statement: string,
    parameters: Record<string, unknown> = {}
  ): Promise<T[]> {
    if (!this.isEnabled()) return [];

    const driver = this.getDriver();
    const session: Session = driver.session({ database: config.graph.database });

    try {
      const result = await session.run(statement, parameters);
      return result.records.map((record) => record.get(0) as T);
    } finally {
      await session.close();
    }
  }

  async healthCheck(): Promise<boolean> {
    if (!this.isEnabled()) return false;

    try {
      const rows = await this.runQuery<number>("RETURN 1 as ok");
      const healthy = rows[0] === 1;
      logger.debug({ uri: config.graph.uri, healthy }, "Graph health check executed");
      return healthy;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), uri: config.graph.uri },
        "Graph health check failed"
      );
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }
  }
}

export const graphClientService = new GraphClientService();
