// API Base URL - defaults to localhost in development
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

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
}

export interface AuthError {
  error: string;
  message: string;
}

export interface OrganizationSignupData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organizationName: string;
  organizationDomain?: string;
}

export interface OrganizationSignupResponse extends AuthResponse {
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
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(credentials),
    });

    if (!response.ok) {
      const error: AuthError = await response.json();
      throw new Error(error.message || "Login failed");
    }

    return response.json();
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
   * Clear tokens from localStorage AND main process
   */
  clearTokens(): void {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");

    // Clear tokens in main process
    if (window.consoleAPI?.clearAuthTokens) {
      window.consoleAPI.clearAuthTokens();
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.getAccessToken();
  }
}

export const authService = new AuthService();
