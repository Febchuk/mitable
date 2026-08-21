import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
} from "react";
import { authService } from "../services/authService";
import type { User, ViewMode, DataScope } from "../types";
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
  viewMode: ViewMode;
  availableViewModes: ViewMode[];
  setViewMode: (mode: ViewMode) => void;
  dataScope: DataScope;
  availableDataScopes: DataScope[];
  setDataScope: (scope: DataScope) => void;
  updateUser: (user: User) => void;
  updateOrganization: (org: Organization) => void;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

function getAvailableViewModes(user: User | null): ViewMode[] {
  if (!user) return ["employee"];
  const modes: ViewMode[] = ["employee"];
  // Admins always get Team view, even without direct reports
  if (user.isManager || user.role === "admin" || user.originalRole === "admin") {
    modes.push("manager");
  }
  return modes;
}

function getInitialViewMode(user: User | null): ViewMode {
  const available = getAvailableViewModes(user);

  // Check saved preference (with old key migration)
  const saved = localStorage.getItem("mitable:viewMode") as string | null;
  const oldMode = !saved ? (localStorage.getItem("mitable:lastMode") as string | null) : null;
  let preferred = saved || oldMode;

  // Migration: treat old "admin" as "manager"
  if (preferred === "admin") preferred = "manager";

  // Only use saved mode if this user is actually allowed to use it
  if (preferred && available.includes(preferred as ViewMode)) return preferred as ViewMode;

  // Default to highest available mode
  if (available.includes("manager")) return "manager";
  return "employee";
}

function canSeeOrgWide(user: User | null): boolean {
  if (!user) return false;
  return (
    user.role === "admin" ||
    user.originalRole === "admin" ||
    (user.permissions?.includes("canSeeOrgWide") ?? false)
  );
}

function getAvailableDataScopes(user: User | null): DataScope[] {
  if (!user?.isManager) {
    return canSeeOrgWide(user) ? ["org-wide"] : [];
  }
  const scopes: DataScope[] = ["direct", "all-reports"];
  if (canSeeOrgWide(user)) scopes.push("org-wide");
  return scopes;
}

function getInitialDataScope(user: User | null): DataScope {
  const available = getAvailableDataScopes(user);
  const saved = localStorage.getItem("mitable:dataScope") as DataScope | null;
  if (saved && available.includes(saved)) return saved;

  if (!user?.isManager && available.includes("org-wide")) return "org-wide";
  if (available.includes("all-reports")) return "all-reports";
  return available[0] ?? "org-wide";
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [viewMode, setViewModeState] = useState<ViewMode>("employee");
  const [dataScope, setDataScopeState] = useState<DataScope>("all-reports");

  const availableViewModes = useMemo(() => getAvailableViewModes(user), [user]);
  const availableDataScopes = useMemo(() => getAvailableDataScopes(user), [user]);

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      if (!availableViewModes.includes(mode)) return;
      setViewModeState(mode);
      localStorage.setItem("mitable:viewMode", mode);
    },
    [availableViewModes]
  );

  const setDataScope = useCallback(
    (scope: DataScope) => {
      if (!availableDataScopes.includes(scope)) return;
      setDataScopeState(scope);
      localStorage.setItem("mitable:dataScope", scope);
    },
    [availableDataScopes]
  );

  // Helper: given an access token, fetch user profile and populate state
  const hydrateUser = async (accessToken: string) => {
    const response = await authService.getMe(accessToken);
    const dbRole = response.profile.role;

    // The profile may include hierarchy fields added in the hierarchy migration
    const profile = response.profile as Record<string, any>;
    const newUser: User = {
      id: profile.id,
      name: `${profile.firstName || ""} ${profile.lastName || ""}`.trim(),
      firstName: profile.firstName || "",
      email: profile.email || undefined,
      avatarUrl: profile.avatarUrl || undefined,
      currentWeek: profile.currentWeek || 1,
      role: dbRole,
      originalRole: dbRole,
      organizationId: profile.organizationId || "",
      isManager: profile.isManager ?? false,
      managerId: profile.managerId ?? null,
      teamId: profile.teamId ?? null,
      department: profile.department ?? null,
      directReportCount: profile.directReportCount ?? 0,
      permissions: profile.permissions ?? [],
    };
    setUser(newUser);
    setViewModeState(getInitialViewMode(newUser));
    setDataScopeState(getInitialDataScope(newUser));

    // Set organization if returned from API
    if (response.organization) {
      setOrganization({
        id: response.organization.id,
        name: response.organization.name,
        settings: response.organization.settings || {},
      });
    }

    setIsAuthenticated(true);

    // Share user context with main process for cross-window access + local SQLite cache
    if (window.consoleAPI?.setCurrentUser) {
      window.consoleAPI.setCurrentUser({
        userId: response.profile.id,
        organizationId: response.profile.organizationId || "",
        role: dbRole,
        email: response.profile.email || undefined,
        firstName: response.profile.firstName || undefined,
        lastName: response.profile.lastName || undefined,
        avatarUrl: response.profile.avatarUrl || undefined,
        organizationName: response.organization?.name,
      });
    }
  };

  // Load user from token on mount
  useEffect(() => {
    const loadUser = async () => {
      // ── Local account check (primary path) ──────────────────────────
      if (window.consoleAPI?.localAuthGetUser) {
        try {
          const localUser = await window.consoleAPI.localAuthGetUser();
          if (localUser) {
            authService.clearTokens();

            const fullName = `${localUser.firstName || ""} ${localUser.lastName || ""}`.trim();
            const newUser: User = {
              id: localUser.id,
              name: fullName || localUser.email,
              firstName: localUser.firstName || "",
              email: localUser.email,
              currentWeek: 1,
              role: "employee",
              organizationId: "local",
              isLocalAccount: true,
            };
            setUser(newUser);
            setIsAuthenticated(true);
            setIsLoading(false);

            if (window.consoleAPI?.setCurrentUser) {
              window.consoleAPI.setCurrentUser({
                userId: localUser.id,
                organizationId: "local",
                role: "employee",
                email: localUser.email,
                firstName: localUser.firstName,
                lastName: localUser.lastName,
              });
            }

            logger.info("Local account authenticated", { userId: localUser.id });
            return;
          }
        } catch (err) {
          logger.warn("Local account check failed:", err);
        }
      }

      // ── Legacy token-based auth (@deprecated — backend auth) ────────
      const token = authService.getAccessToken();

      const isElectron = !!window.consoleAPI;

      if (!token) {
        if (isElectron) {
          logger.info("No local account or token — sending to login");
          setIsLoading(false);
          return;
        }
        logger.info("No local token, waiting for keychain restore…");
        setTimeout(() => {
          setIsLoading((prev) => {
            if (!authService.getAccessToken()) return false;
            return prev;
          });
        }, 2500);
        return;
      }

      // If running in Electron local-only, attempt hydration but don't
      // retry/refresh on network errors — the offline listener handles it.
      try {
        await hydrateUser(token);

        const refreshToken = authService.getRefreshToken();
        if (refreshToken) {
          authService.saveTokens(token, refreshToken);
        }
      } catch (error) {
        if (isNetworkError(error)) {
          logger.info("Backend unreachable, waiting for offline identity");
          return;
        }

        logger.error("Failed to load user:", error);

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

  // Listen for offline user identity from main process (cached in local SQLite)
  // This handles the case where the backend is unreachable but we have a cached user.
  useEffect(() => {
    if (!window.consoleAPI?.onOfflineUser) return;

    const unsubscribe = window.consoleAPI.onOfflineUser((offlineUser) => {
      logger.info("Received offline user identity from main process");

      const fullName = `${offlineUser.firstName || ""} ${offlineUser.lastName || ""}`.trim();
      const newUser: User = {
        id: offlineUser.id,
        name: fullName || offlineUser.email,
        firstName: offlineUser.firstName || "",
        email: offlineUser.email || undefined,
        avatarUrl: offlineUser.avatarUrl || undefined,
        currentWeek: 1,
        role: (offlineUser.role as User["role"]) || "employee",
        organizationId: offlineUser.organizationId || "",
      };
      setUser(newUser);
      setIsAuthenticated(true);
      setIsLoading(false);

      if (offlineUser.organizationName) {
        setOrganization({
          id: offlineUser.organizationId,
          name: offlineUser.organizationName,
          settings: {},
        });
      }

      logger.info("User hydrated from offline cache");
    });

    return () => unsubscribe?.();
  }, []);

  /** @deprecated Background token refresh — not needed for local accounts */
  useEffect(() => {
    if (!isAuthenticated || user?.isLocalAccount) return;

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

    // Share user context with main process (triggers keychain persist + local SQLite cache)
    if (window.consoleAPI?.setCurrentUser) {
      window.consoleAPI.setCurrentUser({
        userId: newUser.id,
        organizationId: newUser.organizationId || "",
        role: newUser.originalRole || newUser.role || "employee",
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.name?.split(" ").slice(1).join(" ") || undefined,
        avatarUrl: newUser.avatarUrl,
        organizationName: organization?.name,
      });
    }
  };

  const updateOrganization = (org: Organization) => {
    setOrganization(org);
  };

  const logout = async () => {
    if (user?.isLocalAccount) {
      if (window.consoleAPI?.localAuthLogout) {
        await window.consoleAPI.localAuthLogout();
      }
      setUser(null);
      setOrganization(null);
      setIsAuthenticated(false);
      return;
    }

    /** @deprecated Backend token-based logout */
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
        viewMode,
        availableViewModes,
        setViewMode,
        dataScope,
        availableDataScopes,
        setDataScope,
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
