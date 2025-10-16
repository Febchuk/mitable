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
 * Make an authenticated API request
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAuthToken();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/api${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: "Unknown Error",
      message: response.statusText,
    }));
    throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}
