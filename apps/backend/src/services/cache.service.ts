import NodeCache from "node-cache";
import crypto from "crypto";

/**
 * Cache Service
 *
 * Simple in-memory caching using node-cache with 10-minute TTL.
 * Generates hash-based keys for complex queries and filters.
 */
class CacheService {
  private cache: NodeCache;

  constructor() {
    // Initialize cache with 10-minute TTL (600 seconds)
    this.cache = new NodeCache({
      stdTTL: 600, // 10 minutes
      checkperiod: 120, // Check for expired keys every 2 minutes
      useClones: false, // Don't clone objects for better performance
    });

    console.log("[CacheService] Initialized with 10-minute TTL");
  }

  /**
   * Generate cache key from organization ID, query, and filters
   */
  generateKey(organizationId: string, query: string, filters?: any): string {
    const data = JSON.stringify({ organizationId, query, filters: filters || {} });
    const hash = crypto.createHash("md5").update(data).digest("hex");
    return `search:${organizationId}:${hash}`;
  }

  /**
   * Get value from cache
   * Returns undefined if not found (cache miss)
   */
  get<T>(key: string): T | undefined {
    return this.cache.get<T>(key);
  }

  /**
   * Set value in cache with optional custom TTL (in seconds)
   */
  set<T>(key: string, value: T, ttl?: number): boolean {
    if (ttl !== undefined) {
      return this.cache.set(key, value, ttl);
    }
    return this.cache.set(key, value);
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Delete specific key from cache
   */
  delete(key: string): number {
    return this.cache.del(key);
  }

  /**
   * Clear all cache entries
   */
  flush(): void {
    this.cache.flushAll();
    console.log("[CacheService] Cache flushed");
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return this.cache.getStats();
  }
}

// Export singleton instance
export const cacheService = new CacheService();
