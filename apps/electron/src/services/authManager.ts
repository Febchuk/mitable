/**
 * Auth Manager
 *
 * Centralized auth token storage for the Electron main process.
 * Used by services that need to make authenticated API calls.
 *
 * Token strategy:
 * - Access token  → memory only (short-lived, refreshed frequently)
 * - Refresh token → OS keychain via keychainService (survives app restarts)
 *
 * On startup, `restoreSession()` retrieves the refresh token from the
 * keychain, calls /auth/refresh, and populates the in-memory access token
 * so all main-process services work immediately — no re-login required.
 */

import { app } from "electron";
import { keychainService } from "./keychainService";
import { createLogger } from "../lib/logger";

const logger = createLogger("AuthManager");

// Production API URL (Railway) - must match renderer config
const PROD_API_URL = "https://mitablebackend-production.up.railway.app";

export interface RestoredSession {
  accessToken: string;
  refreshToken: string;
  userId: string;
  organizationId: string;
}

class AuthManager {
  private accessToken: string | null = null;
  private _refreshToken: string | null = null;
  private _userRole: string | null = null;
  private apiBaseUrl: string;

  constructor() {
    // Use env var in development, hardcoded production URL in packaged app
    // Note: VITE_* env vars are NOT available in main process at runtime
    this.apiBaseUrl = app.isPackaged
      ? PROD_API_URL
      : process.env.VITE_API_URL || "http://localhost:3000";
  }

  /**
   * Set auth tokens in memory (called from IPC handler in main.ts).
   * Optionally persists the refresh token to the OS keychain when
   * orgId + userId are provided.
   */
  async setTokens(
    accessToken: string,
    refreshToken: string,
    userContext?: { orgId: string; userId: string }
  ): Promise<void> {
    this.accessToken = accessToken;
    this._refreshToken = refreshToken;

    if (userContext) {
      await keychainService.saveRefreshToken(userContext.orgId, userContext.userId, refreshToken);
    }
  }

  /**
   * Clear auth tokens from memory AND from the OS keychain.
   */
  async clearTokens(userContext?: { orgId: string; userId: string }): Promise<void> {
    this.accessToken = null;
    this._refreshToken = null;

    if (userContext) {
      await keychainService.clearRefreshToken(userContext.orgId, userContext.userId);
    } else {
      // No specific user — wipe all stored credentials
      await keychainService.clearAll();
    }
  }

  /**
   * Get current access token
   */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * Get current refresh token
   */
  getRefreshToken(): string | null {
    return this._refreshToken;
  }

  /**
   * Get API base URL
   */
  getApiBaseUrl(): string {
    return this.apiBaseUrl;
  }

  /**
   * Set user role (called from main process when user context is set)
   */
  setUserRole(role: string): void {
    this._userRole = role;
  }

  /**
   * Get user role — returns 'admin' | 'employee' | null
   */
  getUserRole(): string | null {
    return this._userRole;
  }

  /**
   * Check if the current user is an admin
   */
  isAdmin(): boolean {
    return this._userRole === "admin";
  }

  /**
   * Attempt to restore a session from the OS keychain on startup.
   *
   * 1. Find all stored Mitable credentials in the keychain
   * 2. Pick the first one (single-user desktop app)
   * 3. Call /auth/refresh with the stored refresh token
   * 4. On success → populate memory tokens and return session info
   * 5. On failure → clear stale credential and return null
   */
  async restoreSession(): Promise<RestoredSession | null> {
    logger.info("Attempting session restore from keychain…");

    const MAX_RETRIES = 5;
    const RETRY_DELAY_MS = 3000; // 5 × 3s = 15s total window

    try {
      const credentials = await keychainService.findAllCredentials();

      const authCredentials = credentials.filter((c) => {
        const [orgId] = c.account.split(":");
        return orgId !== "inference";
      });

      if (authCredentials.length === 0) {
        logger.info("No stored auth credentials — fresh start");
        return null;
      }

      const { account, password: storedRefreshToken } = authCredentials[0];
      const [orgId, userId] = account.split(":");

      if (!orgId || !userId || !storedRefreshToken) {
        logger.warn("Malformed keychain credential, clearing:", { account });
        await keychainService.clearRefreshToken(orgId, userId);
        return null;
      }

      logger.info("Found keychain credential, refreshing…", { account });

      let lastStatus: number | null = null;

      // Retry loop: backend or its Supabase connection may not be ready yet
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const response = await fetch(`${this.apiBaseUrl}/api/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: storedRefreshToken }),
          });

          if (response.ok) {
            const data = await response.json();
            const newAccessToken: string = data.session.access_token;
            const newRefreshToken: string = data.session.refresh_token;

            // Populate memory
            this.accessToken = newAccessToken;
            this._refreshToken = newRefreshToken;

            // Persist the rotated refresh token back to keychain
            await keychainService.saveRefreshToken(orgId, userId, newRefreshToken);

            logger.info("Session restored successfully from keychain", {
              account,
              attempt,
            });

            return {
              accessToken: newAccessToken,
              refreshToken: newRefreshToken,
              userId,
              organizationId: orgId,
            };
          }

          // Non-ok response — backend may still be initializing Supabase
          lastStatus = response.status;
          logger.warn(
            `Session restore attempt ${attempt}/${MAX_RETRIES} got HTTP ${response.status}, retrying in ${RETRY_DELAY_MS}ms…`
          );
        } catch (fetchError) {
          // Network error (server not reachable) — retry
          lastStatus = null;
          logger.warn(
            `Session restore attempt ${attempt}/${MAX_RETRIES} failed (network), retrying in ${RETRY_DELAY_MS}ms…`
          );
        }

        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        }
      }

      // All retries exhausted
      if (lastStatus === 401) {
        // Consistent auth failure after all retries — token is genuinely invalid
        logger.warn("Refresh failed after all retries, clearing stale credential", {
          account,
        });
        await keychainService.clearRefreshToken(orgId, userId);
      } else {
        // Network or server errors — keep keychain, server may come up later
        logger.warn("Session restore: all retries exhausted, will try again on next launch");
      }
      return null;
    } catch (error) {
      logger.error("Session restore failed:", error);
      return null;
    }
  }

  /**
   * Proactively refresh the access token using the stored refresh token.
   * Returns the fresh access token, or null if refresh failed.
   * Updates both in-memory tokens and persists the rotated refresh token.
   */
  async refreshAccessToken(userContext?: {
    orgId: string;
    userId: string;
  }): Promise<string | null> {
    if (!this._refreshToken) {
      logger.warn("Cannot refresh — no refresh token available");
      return null;
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: this._refreshToken }),
      });

      if (!response.ok) {
        logger.warn(`Token refresh failed with HTTP ${response.status}`);
        return null;
      }

      const data = await response.json();
      const newAccessToken: string = data.session.access_token;
      const newRefreshToken: string = data.session.refresh_token;

      this.accessToken = newAccessToken;
      this._refreshToken = newRefreshToken;

      if (userContext) {
        await keychainService.saveRefreshToken(
          userContext.orgId,
          userContext.userId,
          newRefreshToken
        );
      }

      logger.info("Access token refreshed proactively");
      return newAccessToken;
    } catch (error) {
      logger.error("Token refresh request failed:", error);
      return null;
    }
  }

  /**
   * Make an authenticated fetch request
   */
  async authenticatedFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
    if (!this.accessToken) {
      throw new Error("No auth token available");
    }

    const url = endpoint.startsWith("http") ? endpoint : `${this.apiBaseUrl}${endpoint}`;

    return fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
        ...options.headers,
      },
    });
  }
}

// Export singleton
export const authManager = new AuthManager();
