import { createLogger } from "../../../lib/logger";
import { API_BASE_URL } from "../lib/config";

const logger = createLogger("AuthService");

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    user_metadata?: {
      first_name?: string;
      last_name?: string;
    };
  };
  session: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  profile: {
    id: string;
    organizationId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: "admin" | "employee";
    avatarUrl: string | null;
    currentWeek: number | null;
    startDate: string | null;
    status: "active" | "inactive";
  };
  organization?: {
    id: string;
    name: string;
    settings: Record<string, unknown>;
  };
}

export interface AuthError {
  error: string;
  message: string;
}

export interface OrganizationSignupData {
  accountType?: "personal" | "team"; // Default "team" for backwards compatibility
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organizationName?: string; // Required for team, auto-generated for personal
  organizationDomain?: string;
}

export interface OrganizationSignupResponse {
  success?: boolean;
  message?: string;
  user: AuthResponse["user"];
  session: AuthResponse["session"];
  profile: AuthResponse["profile"];
  organization: {
    id: string;
    name: string;
    domain: string | null;
  };
}

class AuthService {
  /**
   * Login with email and password
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    logger.info(` Attempting login to: ${API_BASE_URL}/api/auth/login`);
    logger.info(` API_BASE_URL resolved to: ${API_BASE_URL}`);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(credentials),
      });

      logger.info(` Login response status: ${response.status}`);

      if (!response.ok) {
        const error: AuthError = await response.json();
        logger.error(` Login failed:`, error);
        throw new Error(error.message || "Login failed");
      }

      const data = await response.json();
      logger.info(` Login successful for user:`, data.user.email);
      return data;
    } catch (error) {
      logger.error(` Login request failed:`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        url: `${API_BASE_URL}/api/auth/login`,
      });
      throw error;
    }
  }

  /**
   * Sign up organization with first admin user
   */
  async signupOrganization(data: OrganizationSignupData): Promise<OrganizationSignupResponse> {
    const response = await fetch(`${API_BASE_URL}/api/auth/signup-organization`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || errorData.message || "Signup failed");
    }

    return response.json();
  }

  /**
   * Logout current user
   */
  async logout(accessToken: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error: AuthError = await response.json();
      throw new Error(error.message || "Logout failed");
    }
  }

  /**
   * Get current user profile
   */
  async getMe(accessToken: string): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error: AuthError = await response.json();
      throw new Error(error.message || "Failed to fetch user profile");
    }

    return response.json();
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<{ session: AuthResponse["session"] }> {
    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      const error: AuthError = await response.json();
      throw new Error(error.message || "Failed to refresh token");
    }

    return response.json();
  }

  /**
   * Store tokens in localStorage AND send to main process for cross-window sharing
   */
  saveTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem("access_token", accessToken);
    localStorage.setItem("refresh_token", refreshToken);

    // Send tokens to main process for sharing with other windows (Agent, Guide, Nudge)
    if (window.consoleAPI?.setAuthTokens) {
      window.consoleAPI.setAuthTokens(accessToken, refreshToken);
    }
  }

  /**
   * Get access token from localStorage
   */
  getAccessToken(): string | null {
    return localStorage.getItem("access_token");
  }

  /**
   * Get refresh token from localStorage
   */
  getRefreshToken(): string | null {
    return localStorage.getItem("refresh_token");
  }

  /**
   * Clear backend tokens from localStorage only.
   * Does NOT touch the OS keychain — BYOK API keys live there.
   */
  clearTokens(): void {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.getAccessToken();
  }

  /**
   * Request password reset email
   */
  async forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const error: AuthError = await response.json();
      throw new Error(error.message || "Failed to send reset email");
    }

    return response.json();
  }

  /**
   * Change password (authenticated user)
   */
  async changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; message: string }> {
    const accessToken = this.getAccessToken();
    if (!accessToken) {
      throw new Error("Not authenticated");
    }

    const response = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to change password");
    }

    return response.json();
  }
}

export const authService = new AuthService();
