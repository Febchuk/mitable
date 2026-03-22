import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { authService } from "../services/authService";
import type { User } from "../types";
import { createLogger } from "../../../lib/logger";
import type { OrgSettings } from "@mitable/shared";

const logger = createLogger("UserContext");

/** True for fetch failures (server unreachable) vs real HTTP errors */
function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError && /failed to fetch|network/i.test(error.message);
}

interface Organization {
  id: string;
  name: string;
  settings: OrgSettings;
}

interface UserContextType {
  user: User | null;
  organization: Organization | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  updateUser: (user: User) => void;
  updateOrganization: (org: Organization) => void;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Helper: given an access token, fetch user profile and populate state
  const hydrateUser = async (accessToken: string) => {
    const response = await authService.getMe(accessToken);
    // Restore last-used mode if the user is an admin who previously switched
    const dbRole = response.profile.role;
    const savedMode = localStorage.getItem("mitable:lastMode") as "admin" | "employee" | null;
    const effectiveRole = dbRole === "admin" && savedMode ? savedMode : dbRole;

    setUser({
      id: response.profile.id,
      name: `${response.profile.firstName || ""} ${response.profile.lastName || ""}`.trim(),
      firstName: response.profile.firstName || "",
      email: response.profile.email || undefined,
      avatarUrl: response.profile.avatarUrl || undefined,
      currentWeek: response.profile.currentWeek || 1,
      role: effectiveRole,
      originalRole: dbRole,
      organizationId: response.profile.organizationId || "",
    });

    // Set organization if returned from API
    if (response.organization) {
      setOrganization({
        id: response.organization.id,
        name: response.organization.name,
        settings: response.organization.settings || {},
      });
    }

    setIsAuthenticated(true);

    // Share user context with main process for cross-window access (WatchingPill, etc.)
    if (window.consoleAPI?.setCurrentUser) {
      window.consoleAPI.setCurrentUser({
        userId: response.profile.id,
        organizationId: response.profile.organizationId || "",
        role: dbRole,
      });
    }
  };

  // Load user from token on mount
  useEffect(() => {
    const loadUser = async () => {
      const token = authService.getAccessToken();

      if (!token) {
        // No token in localStorage — wait briefly for main process to push
        // restored tokens from OS keychain before giving up
        logger.info("No local token, waiting for keychain restore…");
        setTimeout(() => {
          // If still not authenticated after delay, stop loading
          setIsLoading((prev) => {
            // Only clear loading if we haven't been authenticated by the restore listener
            if (!authService.getAccessToken()) {
              return false;
            }
            return prev;
          });
        }, 2500);
        return;
      }

      try {
        await hydrateUser(token);

        // Broadcast token to main process for cross-window sharing (Agent pill, etc.)
        const refreshToken = authService.getRefreshToken();
        if (refreshToken) {
          authService.saveTokens(token, refreshToken);
        }
      } catch (error) {
        logger.error("Failed to load user:", error);

        // Network error (backend not up yet) — keep tokens and wait for restore
        if (isNetworkError(error)) {
          logger.info("Backend unreachable, preserving tokens for later restore");
          return;
        }

        // Token might be expired, try to refresh
        const refreshToken = authService.getRefreshToken();
        if (refreshToken) {
          try {
            const refreshResponse = await authService.refreshToken(refreshToken);
            authService.saveTokens(
              refreshResponse.session.access_token,
              refreshResponse.session.refresh_token
            );
            await hydrateUser(refreshResponse.session.access_token);
          } catch (refreshError) {
            logger.error("Failed to refresh token:", refreshError);
            if (!isNetworkError(refreshError)) {
              authService.clearTokens();
            } else {
              logger.info("Backend unreachable during refresh, preserving tokens");
            }
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

  // Listen for session restore from main process (keychain → IPC push)
  // This handles the case where localStorage was cleared but the OS keychain
  // still has a valid refresh token.
  useEffect(() => {
    if (!window.consoleAPI?.onSessionRestored) return;

    const unsubscribe = window.consoleAPI.onSessionRestored(async (tokens) => {
      logger.info("Received restored tokens from main process");

      // Persist to localStorage so all renderer services can use them
      authService.saveTokens(tokens.accessToken, tokens.refreshToken);

      try {
        await hydrateUser(tokens.accessToken);
        logger.info("User hydrated from keychain-restored tokens");
      } catch (error) {
        logger.error("Failed to hydrate user from restored tokens:", error);
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe?.();
  }, []);

  // Background token refresh - keeps sessions alive for long-running usage
  useEffect(() => {
    if (!isAuthenticated) return;

    const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

    const refreshInterval = setInterval(async () => {
      const refreshToken = authService.getRefreshToken();
      if (!refreshToken) return;

      try {
        logger.info("Background token refresh triggered");
        const response = await authService.refreshToken(refreshToken);
        authService.saveTokens(response.session.access_token, response.session.refresh_token);
        logger.info("Token refreshed successfully");
      } catch (error) {
        logger.error("Background token refresh failed:", error);
        // Only logout on real auth errors, not network blips
        if (!isNetworkError(error)) {
          authService.clearTokens();
          setUser(null);
          setIsAuthenticated(false);
        }
      }
    }, REFRESH_INTERVAL);

    return () => clearInterval(refreshInterval);
  }, [isAuthenticated]);

  const updateUser = (newUser: User) => {
    setUser(newUser);
    setIsAuthenticated(true);

    // Share user context with main process (triggers keychain persist for refresh token)
    if (window.consoleAPI?.setCurrentUser) {
      window.consoleAPI.setCurrentUser({
        userId: newUser.id,
        organizationId: newUser.organizationId || "",
        role: newUser.originalRole || newUser.role || "employee",
      });
    }
  };

  const updateOrganization = (org: Organization) => {
    setOrganization(org);
  };

  const logout = async () => {
    const token = authService.getAccessToken();
    if (token) {
      try {
        await authService.logout(token);
      } catch (error) {
        logger.error("Logout error:", error);
      }
    }
    authService.clearTokens();
    setUser(null);
    setOrganization(null);
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
      value={{
        user,
        organization,
        isLoading,
        isAuthenticated,
        updateUser,
        updateOrganization,
        logout,
        refreshAuth,
      }}
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
