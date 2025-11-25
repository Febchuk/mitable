/**
 * Base API configuration and utilities
 */

import { authService } from "./authService";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

/**
 * Get the authentication token from localStorage
 */
export async function getAuthToken(): Promise<string | null> {
  return authService.getAccessToken();
}

/**
 * Make an authenticated API request with automatic token refresh
 */
export async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  let token = await getAuthToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let response = await fetch(`${API_BASE_URL}/api${endpoint}`, {
    ...options,
    headers,
  });

  // If we get 401, try to refresh the token once
  if (response.status === 401 && token) {
    console.log("[API] Token expired, attempting refresh...");
    
    const refreshToken = authService.getRefreshToken();
    if (refreshToken) {
      try {
        // Attempt to refresh the token
        const refreshResponse = await authService.refreshToken(refreshToken);
        authService.saveTokens(
          refreshResponse.session.access_token,
          refreshResponse.session.refresh_token
        );

        // Retry the original request with new token
        headers["Authorization"] = `Bearer ${refreshResponse.session.access_token}`;
        response = await fetch(`${API_BASE_URL}/api${endpoint}`, {
          ...options,
          headers,
        });

        console.log("[API] Token refreshed successfully, request retried");
      } catch (refreshError) {
        console.error("[API] Token refresh failed:", refreshError);
        // Clear tokens and redirect to login (use hash for HashRouter)
        authService.clearTokens();
        window.location.hash = "#/login";
        throw new Error("Session expired. Please log in again.");
      }
    } else {
      // No refresh token, redirect to login (use hash for HashRouter)
      authService.clearTokens();
      window.location.hash = "#/login";
      throw new Error("Session expired. Please log in again.");
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: "Unknown Error",
      message: response.statusText,
    }));
    throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}
