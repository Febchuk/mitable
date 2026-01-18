/**
 * Base API configuration and utilities
 */

import { authService } from "./authService";
import { createLogger } from "../../../lib/logger";
import { API_BASE_URL } from "../lib/config";

const logger = createLogger("API");

// Re-export for convenience
export { API_BASE_URL };

/**
 * Get the authentication token from localStorage
 */
export async function getAuthToken(): Promise<string | null> {
  return authService.getAccessToken();
}

/**
 * Make an authenticated API request with automatic 401 retry
 */
export async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const makeRequest = async (token: string | null): Promise<Response> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    return fetch(`${API_BASE_URL}/api${endpoint}`, {
      ...options,
      headers,
    });
  };

  let token = await getAuthToken();
  let response = await makeRequest(token);

  // On 401, attempt token refresh and retry once
  if (response.status === 401) {
    const refreshToken = authService.getRefreshToken();
    if (refreshToken) {
      try {
        logger.info(" Token expired, attempting refresh...");
        const refreshResponse = await authService.refreshToken(refreshToken);
        authService.saveTokens(
          refreshResponse.session.access_token,
          refreshResponse.session.refresh_token
        );
        token = refreshResponse.session.access_token;
        response = await makeRequest(token);
        logger.info(" Token refreshed, request retried successfully");
      } catch (refreshError) {
        logger.error(" Token refresh failed:", refreshError);
        // Refresh failed - clear tokens and redirect to login
        authService.clearTokens();
        window.location.href = "/login";
        throw new Error("Session expired. Please log in again.");
      }
    } else {
      // No refresh token available - redirect to login
      authService.clearTokens();
      window.location.href = "/login";
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

/**
 * Make an authenticated API request without Content-Type header
 * Used for multipart/form-data uploads where browser sets Content-Type with boundary
 */
export async function apiRequestRaw<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const makeRequest = async (token: string | null): Promise<Response> => {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    // Don't set Content-Type - let browser handle it for FormData
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    return fetch(`${API_BASE_URL}/api${endpoint}`, {
      ...options,
      headers,
    });
  };

  let token = await getAuthToken();
  let response = await makeRequest(token);

  // On 401, attempt token refresh and retry once
  if (response.status === 401) {
    const refreshToken = authService.getRefreshToken();
    if (refreshToken) {
      try {
        logger.info(" Token expired, attempting refresh...");
        const refreshResponse = await authService.refreshToken(refreshToken);
        authService.saveTokens(
          refreshResponse.session.access_token,
          refreshResponse.session.refresh_token
        );
        token = refreshResponse.session.access_token;
        response = await makeRequest(token);
        logger.info(" Token refreshed, request retried successfully");
      } catch (refreshError) {
        logger.error(" Token refresh failed:", refreshError);
        authService.clearTokens();
        window.location.href = "/login";
        throw new Error("Session expired. Please log in again.");
      }
    } else {
      authService.clearTokens();
      window.location.href = "/login";
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
