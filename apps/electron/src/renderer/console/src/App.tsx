import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { ErrorBoundary } from "../../components/common/ErrorBoundary";
import { installConsoleCaptureForFeedback } from "../../lib/feedback-log-buffer";
import { createLogger } from "../../lib/logger";

installConsoleCaptureForFeedback();
const logger = createLogger("ConsoleApp");
import { Skeleton } from "@/components/ui/skeleton";
import { UserProvider, useUser } from "./context/UserContext";
import { UpdateProvider } from "./context/UpdateContext";
import { VariantProvider } from "./context/VariantContext";
import { RecapsProvider } from "./context/RecapsContext";
import { DevFlagsProvider } from "./context/DevFlagsContext";
import { PostHogTracker } from "./context/PostHogContext";
import type { OrgVariant } from "@mitable/shared";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ConsoleLayout from "./components/layout/ConsoleLayout";
import LoginPage from "./pages/LoginPage";
import SignupOrganizationPage from "./pages/SignupOrganizationPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import MonitoringView from "./components/views/employee/MonitoringView";
import SessionDetail from "./components/views/employee/MonitoringView/SessionDetail";
import CalendarView from "./components/views/employee/CalendarView";
import RecapsView from "./components/views/employee/RecapsView";
import RecapDetail from "./components/views/employee/RecapsView/RecapDetail";
import { monitoringKeys } from "./hooks/queries/monitoring";
import DocsView from "./components/views/employee/DocsView";
import DocDetail from "./components/views/employee/DocsView/DocDetail";
import UserProfilePage from "./pages/UserProfilePage";
import DashboardView from "./components/views/admin/DashboardView";
import CustomerDetailView from "./components/views/admin/DashboardView/CustomerDetailView";
import PeopleView from "./components/views/admin/PeopleView";
import AddNewUser from "./components/views/admin/PeopleView/AddNewUser";
import PersonDetail from "./components/views/admin/PeopleView/PersonDetail";
import IntegrationsView from "./components/views/admin/IntegrationsView";
import AgentView from "./components/views/employee/AgentView";
import MeView from "./components/views/employee/MeView";
import BragbookView from "./components/views/employee/BragbookView";
import BenchmarksRouter from "./components/views/shared/BenchmarksRouter";
import BenchmarkDetailRouter from "./components/views/shared/BenchmarkDetailRouter";
import PersonBenchmarkView from "./components/views/admin/BenchmarksView/PersonBenchmarkView";
import BenchmarkEditor from "./components/views/admin/BenchmarksView/BenchmarkEditor";
import React, { useEffect, useRef } from "react";
import { useTheme } from "./hooks/useTheme";
import TeamsView from "./components/views/admin/TeamsView";
import OrgSetupView from "./components/views/admin/OrgSetupView";
import OnDeviceAIView from "./components/views/employee/OnDeviceAIView";

// Applies stored theme class to <html> on mount and syncs across windows
function ThemeInitializer() {
  useTheme();
  return null;
}

// Navigation handler - listens for IPC navigation events from main process
function NavigationHandler() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;

  useEffect(() => {
    // Skip if not running in Electron or preload script not ready
    if (!window.consoleAPI) {
      logger.warn(" window.consoleAPI not available - IPC navigation disabled");
      return;
    }

    // Listen for navigation requests from main process (e.g., from Agent window)
    const unsubscribeChat = window.consoleAPI.onNavigateToChat?.((conversationId: string) => {
      logger.info(" Navigating to chat:", conversationId);
      navigate(`/agent/${conversationId}`);
    });

    // Listen for active session navigation (from native notification click)
    const unsubscribeActiveSession = window.consoleAPI.onNavigateToActiveSession?.(async () => {
      logger.info(" Navigate to active session requested");
      try {
        const sessionState = await window.consoleAPI?.getMonitoringSessionState();
        if (sessionState?.id) {
          logger.info(" Navigating to active session:", sessionState.id);
          navigate(`/monitoring/${sessionState.id}`);
        } else {
          logger.info(" No active session found, navigating to monitoring view");
          navigate("/monitoring");
        }
      } catch (error) {
        logger.error(" Error getting session state:", error);
        navigate("/monitoring");
      }
    });

    // Listen for end session dialog trigger from pill (via main process)
    // Navigate to session detail page with query param to open dialog
    const unsubscribeEndDialog = window.consoleAPI.onShowEndSessionDialog?.(async () => {
      logger.info(" End session dialog triggered from pill");
      try {
        const sessionState = await window.consoleAPI?.getMonitoringSessionState();
        if (sessionState?.id) {
          logger.info(" Navigating to session detail with dialog flag:", sessionState.id);
          navigate(`/monitoring/${sessionState.id}?openEndDialog=true`);
        } else {
          logger.warn(" No active session found for end dialog trigger");
        }
      } catch (error) {
        logger.error(" Error getting session state for end dialog:", error);
      }
    });

    // Listen for navigate-to-update (from update notification click)
    const unsubscribeUpdate = window.consoleAPI.onNavigateToUpdate?.(() => {
      logger.info(" Navigate to update/profile requested");
      navigate("/profile");
    });

    const unsubscribeSessionDetail = window.consoleAPI.onNavigateToSessionDetail?.((payload) => {
      // If user is on Calendar view, don't navigate away — just refresh data
      if (pathnameRef.current === "/calendar") {
        logger.info(" Session detail event on Calendar — refreshing data instead of navigating");
        queryClient.invalidateQueries({ queryKey: ["calendar"] });
        queryClient.invalidateQueries({ queryKey: ["monitoring"] });
        return;
      }
      logger.info(" Navigating to session detail:", payload);
      const params = new URLSearchParams();
      if (payload.openEndDialog) {
        params.set("openEndDialog", "true");
      }
      if (payload.showSummaryToast) {
        params.set("summaryToast", "true");
      }
      const query = params.toString();
      navigate(`/monitoring/${payload.sessionId}${query ? `?${query}` : ""}`);
    });

    return () => {
      unsubscribeChat?.();
      unsubscribeActiveSession?.();
      unsubscribeEndDialog?.();
      unsubscribeUpdate?.();
      unsubscribeSessionDetail?.();
    };
  }, [navigate, queryClient]);

  // Track last visited path per nav section (e.g. /docs/abc-123 → section "docs")
  // so sidebar nav can return users to where they left off
  useEffect(() => {
    const section = location.pathname.split("/")[1]; // e.g. "docs", "recaps", "calendar"
    if (section) {
      sessionStorage.setItem(`nav:last:${section}`, location.pathname + location.search);
    }
  }, [location.pathname, location.search]);

  return null;
}

// Monitoring session handler - listens for session updates from WatchingPill/main process
function MonitoringSessionHandler() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Skip if not running in Electron or preload script not ready
    if (!window.consoleAPI) {
      return;
    }

    const unsubscribe = window.consoleAPI.onMonitoringSessionUpdate?.((state) => {
      logger.info(" Monitoring session update:", state?.status, state?.id);

      // Invalidate session + calendar queries on any status change (paused, active, ended, cleared)
      if (state?.id) {
        queryClient.invalidateQueries({ queryKey: monitoringKeys.session(state.id) });
      }
      // Always invalidate sessions list + calendar — including when state is null (session cleared)
      queryClient.invalidateQueries({ queryKey: monitoringKeys.sessions() });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
    });

    return () => unsubscribe?.();
  }, [queryClient]);

  return null;
}

// Default route -- redirects based on user role
function DefaultRoute() {
  const { user } = useUser();
  if (user?.role === "admin" || user?.isManager) return <Navigate to="/dashboard" replace />;
  return <Navigate to="/calendar" replace />;
}

// Protected route wrapper - redirects to login if not authenticated
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="flex h-screen">
        {/* Sidebar skeleton */}
        <div className="w-[220px] flex-shrink-0 border-r border-stroke-subtle p-4 space-y-4">
          <Skeleton className="h-8 w-24 mb-6" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded-lg" />
          ))}
        </div>
        {/* Main content skeleton */}
        <div className="flex-1 p-8 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
          <div className="pt-4 space-y-3">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function RoleGate({
  requireAdmin,
  requireManager,
  children,
}: {
  requireAdmin?: boolean;
  requireManager?: boolean;
  children: React.ReactNode;
}) {
  const { user } = useUser();
  const isAdmin = user?.role === "admin" || user?.originalRole === "admin";
  if (requireAdmin && !isAdmin) return <Navigate to="/calendar" replace />;
  if (requireManager && !isAdmin && !user?.isManager) return <Navigate to="/calendar" replace />;
  return <>{children}</>;
}

// Variant wrapper - provides organization variant context from user's org settings
function VariantWrapper({ children }: { children: React.ReactNode }) {
  const { organization } = useUser();
  const variant = (organization?.settings?.variant as OrgVariant) || "global";

  return <VariantProvider variant={variant}>{children}</VariantProvider>;
}

function App() {
  // Log startup configuration
  useEffect(() => {
    logger.info(" Console App Environment:", {
      apiUrl: import.meta.env.VITE_API_URL || "undefined (will use localhost:3000)",
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL || "undefined",
      mode: import.meta.env.MODE,
      dev: import.meta.env.DEV,
      prod: import.meta.env.PROD,
    });
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <TooltipProvider>
            <ThemeInitializer />
            <NavigationHandler />
            <MonitoringSessionHandler />
            <UpdateProvider>
              <UserProvider>
                <PostHogTracker />
                <VariantWrapper>
                  <DevFlagsProvider>
                    <RecapsProvider>
                      <Routes>
                        {/* Public routes */}
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/signup-organization" element={<SignupOrganizationPage />} />
                        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                        <Route path="/reset-password" element={<ResetPasswordPage />} />
                        {/* Protected routes */}
                        <Route
                          path="/"
                          element={
                            <ProtectedRoute>
                              <ConsoleLayout />
                            </ProtectedRoute>
                          }
                        >
                          <Route index element={<DefaultRoute />} />
                          {/* Admin Routes */}
                          <Route path="dashboard" element={<DashboardView />} />
                          <Route path="customer/:name" element={<CustomerDetailView />} />
                          <Route path="people" element={<PeopleView />} />
                          <Route path="people/new" element={<AddNewUser />} />
                          <Route path="people/:id" element={<PersonDetail />} />
                          <Route path="reports/:docId" element={<DocDetail />} />
                          <Route path="benchmarks" element={<BenchmarksRouter />} />
                          <Route
                            path="benchmarks/new"
                            element={
                              <RoleGate requireManager>
                                <BenchmarkEditor />
                              </RoleGate>
                            }
                          />
                          <Route
                            path="benchmarks/:id/edit"
                            element={
                              <RoleGate requireManager>
                                <BenchmarkEditor />
                              </RoleGate>
                            }
                          />
                          <Route path="benchmarks/:id" element={<BenchmarkDetailRouter />} />
                          <Route
                            path="benchmarks/:id/person/:userId"
                            element={
                              <RoleGate requireManager>
                                <PersonBenchmarkView />
                              </RoleGate>
                            }
                          />
                          <Route path="integrations" element={<IntegrationsView />} />
                          <Route
                            path="org-setup"
                            element={
                              <RoleGate requireAdmin>
                                <OrgSetupView />
                              </RoleGate>
                            }
                          />
                          <Route path="setup" element={<Navigate to="/org-setup" replace />} />
                          <Route path="org-chart" element={<Navigate to="/org-setup" replace />} />
                          <Route
                            path="teams"
                            element={
                              <RoleGate requireAdmin>
                                <TeamsView />
                              </RoleGate>
                            }
                          />
                          {/* Employee Routes */}
                          <Route path="me" element={<MeView />} />
                          <Route path="bragbook" element={<BragbookView />} />
                          <Route path="docs" element={<DocsView />} />
                          <Route path="docs/:docId" element={<DocDetail />} />
                          {/* Calendar/Journal Routes */}
                          <Route path="calendar" element={<CalendarView />} />
                          <Route path="recaps" element={<RecapsView />} />
                          <Route path="recaps/:recapId" element={<RecapDetail />} />
                          {/* Focused Sessions Routes */}
                          <Route path="monitoring" element={<MonitoringView />} />
                          <Route path="monitoring/:sessionId" element={<SessionDetail />} />
                          <Route path="agent" element={<AgentView />} />
                          <Route path="agent/:chatId" element={<AgentView />} />
                          <Route path="profile" element={<UserProfilePage />} />
                          <Route path="on-device-ai" element={<OnDeviceAIView />} />
                        </Route>
                      </Routes>
                    </RecapsProvider>
                  </DevFlagsProvider>
                  <Toaster />
                </VariantWrapper>
              </UserProvider>
            </UpdateProvider>
          </TooltipProvider>
        </HashRouter>
        {import.meta.env.DEV && <ReactQueryDevtoolsWrapper />}
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

// Lazily load ReactQueryDevtools only in development to keep it out of the production bundle.
function ReactQueryDevtoolsWrapper() {
  const [Devtools, setDevtools] = React.useState<React.ComponentType<{
    initialIsOpen: boolean;
  }> | null>(null);

  React.useEffect(() => {
    import("@tanstack/react-query-devtools").then((mod) => {
      setDevtools(() => mod.ReactQueryDevtools);
    });
  }, []);

  if (!Devtools) return null;
  return <Devtools initialIsOpen={false} />;
}

export default App;
