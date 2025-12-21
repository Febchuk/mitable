/**
 * Auth Manager
 *
 * Centralized auth token storage for the Electron main process.
 * Used by services that need to make authenticated API calls.
 */

class AuthManager {
  private accessToken: string | null = null;
  private _refreshToken: string | null = null; // Stored for future refresh logic
  private apiBaseUrl: string;

  constructor() {
    this.apiBaseUrl = process.env.VITE_API_URL || "http://localhost:3000";
  }

  /**
   * Set auth tokens (called from IPC handler in main.ts)
   */
  setTokens(accessToken: string, refreshToken: string): void {
    this.accessToken = accessToken;
    this._refreshToken = refreshToken;
  }

  /**
   * Clear auth tokens (called on logout)
   */
  clearTokens(): void {
    this.accessToken = null;
    this._refreshToken = null;
  }

  /**
   * Get current access token
   */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * Get current refresh token (for future token refresh logic)
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
