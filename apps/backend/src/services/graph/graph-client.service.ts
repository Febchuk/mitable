import { config } from "../../config";
import { createLogger } from "../../lib/logger";

const logger = createLogger({ context: "graph-client" });

interface Neo4jHttpResponse {
  results?: Array<{ data?: Array<{ row?: any[] }> }>;
  errors?: Array<{ code: string; message: string }>;
}

class GraphClientService {
  private getBaseHttpUri(): string {
    const uri = config.graph.uri;
    if (!uri) {
      throw new Error("GRAPH_URI is not configured");
    }

    if (uri.startsWith("bolt://") || uri.startsWith("neo4j://")) {
      throw new Error(
        "GRAPH_URI must be an HTTP(S) Neo4j endpoint (e.g., http://localhost:7474 or Aura https endpoint)"
      );
    }

    return uri.replace(/\/+$/, "");
  }

  private getTxCommitUrl(): string {
    const base = this.getBaseHttpUri();
    return `${base}/db/${config.graph.database}/tx/commit`;
  }

  isEnabled(): boolean {
    return config.graph.enabled;
  }

  getDatabaseName(): string {
    return config.graph.database;
  }

  async runQuery<T = unknown>(statement: string, parameters: Record<string, unknown> = {}): Promise<T[]> {
    if (!this.isEnabled()) return [];

    const url = this.getTxCommitUrl();
    const auth = Buffer.from(`${config.graph.user}:${config.graph.password}`).toString("base64");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        statements: [{ statement, parameters }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Neo4j HTTP request failed (${response.status} ${response.statusText})`);
    }

    const payload = (await response.json()) as Neo4jHttpResponse;
    if (payload.errors && payload.errors.length > 0) {
      const first = payload.errors[0];
      throw new Error(`Neo4j error: ${first?.code || "UNKNOWN"} - ${first?.message || "Unknown error"}`);
    }

    const rows = payload.results?.[0]?.data?.map((entry) => (entry.row ? entry.row[0] : undefined)) || [];
    return rows as T[];
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
}

export const graphClientService = new GraphClientService();
