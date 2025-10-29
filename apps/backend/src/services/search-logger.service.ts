import fs from "fs";
import path from "path";

/**
 * Search Logger Service
 *
 * Logs search queries and performance metrics to logs/search.log file.
 * Format: [SearchService] Cache HIT/MISS - Query: "..." - Time: Xms - Results: X (X semantic, X keyword)
 */
class SearchLoggerService {
  private logFile: string;

  constructor() {
    // Create logs directory if it doesn't exist
    const logsDir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    this.logFile = path.join(logsDir, "search.log");
    console.log(`[SearchLoggerService] Logging to: ${this.logFile}`);
  }

  /**
   * Log search query with performance metrics
   */
  logSearch(params: {
    cacheHit: boolean;
    query: string;
    timeMs: number;
    totalResults: number;
    semanticResults: number;
    keywordResults: number;
  }): void {
    const { cacheHit, query, timeMs, totalResults, semanticResults, keywordResults } = params;

    const cacheStatus = cacheHit ? "Cache HIT " : "Cache MISS";
    const timestamp = new Date().toISOString();

    // Truncate query if too long
    const truncatedQuery = query.length > 50 ? query.substring(0, 50) + "..." : query;

    const logLine = `[${timestamp}] [SearchService] ${cacheStatus} - Query: "${truncatedQuery}" - Time: ${timeMs}ms - Results: ${totalResults} (${semanticResults} semantic, ${keywordResults} keyword)\n`;

    // Append to log file
    fs.appendFileSync(this.logFile, logLine, "utf8");
  }

  /**
   * Log no-results query
   */
  logNoResults(params: { cacheHit: boolean; query: string; timeMs: number }): void {
    const { cacheHit, query, timeMs } = params;

    const cacheStatus = cacheHit ? "Cache HIT " : "Cache MISS";
    const timestamp = new Date().toISOString();

    const truncatedQuery = query.length > 50 ? query.substring(0, 50) + "..." : query;

    const logLine = `[${timestamp}] [SearchService] ${cacheStatus} - Query: "${truncatedQuery}" - Time: ${timeMs}ms - Results: 0 (NO RESULTS)\n`;

    fs.appendFileSync(this.logFile, logLine, "utf8");
  }

  /**
   * Log cache statistics (optional - can be called periodically)
   */
  logCacheStats(stats: {
    hits: number;
    misses: number;
    keys: number;
    ksize: number;
    vsize: number;
  }): void {
    const timestamp = new Date().toISOString();
    const hitRate =
      stats.hits + stats.misses > 0
        ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(2)
        : "0.00";

    const logLine = `[${timestamp}] [CacheStats] Hits: ${stats.hits} | Misses: ${stats.misses} | Hit Rate: ${hitRate}% | Keys: ${stats.keys}\n`;

    fs.appendFileSync(this.logFile, logLine, "utf8");
  }
}

// Export singleton instance
export const searchLoggerService = new SearchLoggerService();
