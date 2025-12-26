import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { authService } from "../services/authService";
import type { User } from "../types";

interface UserContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  updateUser: (user: User) => void;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Load user from token on mount
  useEffect(() => {
    const loadUser = async () => {
      const token = authService.getAccessToken();

      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await authService.getMe(token);

        setUser({
          id: response.profile.id,
          name: `${response.profile.firstName || ""} ${response.profile.lastName || ""}`.trim(),
          firstName: response.profile.firstName || "",
          avatarUrl: response.profile.avatarUrl || undefined,
          currentWeek: response.profile.currentWeek || 1,
          role: response.profile.role,
          originalRole: response.profile.role,
          organizationId: response.profile.organizationId || "",
        });
        setIsAuthenticated(true);

        // Share user context with main process for cross-window access (WatchingPill, etc.)
        if (window.consoleAPI?.setCurrentUser) {
          window.consoleAPI.setCurrentUser({
            userId: response.profile.id,
            organizationId: response.profile.organizationId || "",
          });
        }

        // Broadcast token to main process for cross-window sharing (Agent pill, etc.)
        const refreshToken = authService.getRefreshToken();
        if (refreshToken) {
          authService.saveTokens(token, refreshToken);
        }
      } catch (error) {
        console.error("Failed to load user:", error);
        // Token might be expired, try to refresh
        const refreshToken = authService.getRefreshToken();
        if (refreshToken) {
          try {
            const refreshResponse = await authService.refreshToken(refreshToken);
            authService.saveTokens(
              refreshResponse.session.access_token,
              refreshResponse.session.refresh_token
            );
            // Try loading user again with new token
            const response = await authService.getMe(refreshResponse.session.access_token);
            setUser({
              id: response.profile.id,
              name: `${response.profile.firstName || ""} ${response.profile.lastName || ""}`.trim(),
              firstName: response.profile.firstName || "",
              avatarUrl: response.profile.avatarUrl || undefined,
              currentWeek: response.profile.currentWeek || 1,
              role: response.profile.role,
              originalRole: response.profile.role,
              organizationId: response.profile.organizationId || "",
            });
            setIsAuthenticated(true);

            // Share user context with main process for cross-window access (WatchingPill, etc.)
            if (window.consoleAPI?.setCurrentUser) {
              window.consoleAPI.setCurrentUser({
                userId: response.profile.id,
                organizationId: response.profile.organizationId || "",
              });
            }
          } catch (refreshError) {
            console.error("Failed to refresh token:", refreshError);
            authService.clearTokens();
          }
        } else {
          authService.clearTokens();
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, []);

  // Background token refresh - keeps sessions alive for long-running usage
  useEffect(() => {
    if (!isAuthenticated) return;

    const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

    const refreshInterval = setInterval(async () => {
      const refreshToken = authService.getRefreshToken();
      if (!refreshToken) return;

      try {
        console.log("[Auth] Background token refresh triggered");
        const response = await authService.refreshToken(refreshToken);
        authService.saveTokens(response.session.access_token, response.session.refresh_token);
        console.log("[Auth] Token refreshed successfully");
      } catch (error) {
        console.error("[Auth] Background token refresh failed:", error);
        // Silent logout on refresh failure
        authService.clearTokens();
        setUser(null);
        setIsAuthenticated(false);
      }
    }, REFRESH_INTERVAL);

    return () => clearInterval(refreshInterval);
  }, [isAuthenticated]);

  const updateUser = (newUser: User) => {
    setUser(newUser);
    setIsAuthenticated(true);
  };

  const logout = async () => {
    const token = authService.getAccessToken();
    if (token) {
      try {
        await authService.logout(token);
      } catch (error) {
        console.error("Logout error:", error);
      }
    }
    authService.clearTokens();
    setUser(null);
    setIsAuthenticated(false);
  };

  const refreshAuth = async () => {
    const refreshToken = authService.getRefreshToken();
    if (!refreshToken) {
      throw new Error("No refresh token available");
    }

    const response = await authService.refreshToken(refreshToken);
    authService.saveTokens(response.session.access_token, response.session.refresh_token);
  };

  return (
    <UserContext.Provider
      value={{ user, isLoading, isAuthenticated, updateUser, logout, refreshAuth }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
