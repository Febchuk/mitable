import { createLogger } from "../../lib/logger";
import { graphSyncService } from "../../services/graph/graph-sync.service";

const logger = createLogger({ context: "graph-sync-job" });

let isGraphSyncRunning = false;

export async function runGraphSyncJob(): Promise<void> {
  if (isGraphSyncRunning) {
    logger.warn("Graph sync already running — skipping");
    return;
  }

  isGraphSyncRunning = true;
  try {
    const result = await graphSyncService.runNightlySync();
    if (!result.success) {
      logger.error({ result }, "Graph sync job failed");
      return;
    }

    logger.info(
      {
        syncedUsers: result.syncedUsers,
        syncedWorkstreams: result.syncedWorkstreams,
        syncedPreferences: result.syncedPreferences,
        durationMs: result.durationMs,
      },
      "Graph sync job completed"
    );
  } catch (error) {
    logger.error({ error: String(error) }, "Graph sync job failed with uncaught error");
  } finally {
    isGraphSyncRunning = false;
  }
}
