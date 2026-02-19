import { HashRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "./lib/queryClient";
import { createLogger } from "../../lib/logger";

const logger = createLogger("ConsoleApp");
import { UserProvider, useUser } from "./context/UserContext";
import { VariantProvider } from "./context/VariantContext";
import { RecapsProvider } from "./context/RecapsContext";
import { DevFlagsProvider, useDevFlags } from "./context/DevFlagsContext";
import type { OrgVariant } from "@mitable/shared";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ConsoleLayout from "./components/layout/ConsoleLayout";
import LoginPage from "./pages/LoginPage";
import SignupOrganizationPage from "./pages/SignupOrganizationPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import RoadmapView from "./components/views/employee/RoadmapView";
import RoadmapTaskDetail from "./components/views/employee/RoadmapView/RoadmapTaskDetail";
import ChatsView from "./components/views/employee/ChatsView";
import ChatDetail from "./components/views/employee/ChatsView/ChatDetail";
import NewChat from "./components/views/employee/ChatsView/NewChat";
import MonitoringView from "./components/views/employee/MonitoringView";
import SessionDetail from "./components/views/employee/MonitoringView/SessionDetail";
import CalendarView from "./components/views/employee/CalendarView";
import RecapsView from "./components/views/employee/RecapsView";
import RecapDetail from "./components/views/employee/RecapsView/RecapDetail";
import { monitoringKeys } from "./hooks/queries/monitoring";
import DocsView from "./components/views/employee/DocsView";
import DocDetail from "./components/views/employee/DocsView/DocDetail";
import TodosView from "./components/views/employee/TodosView";
import ArtifactsView from "./components/views/employee/ArtifactsView";
import UserProfilePage from "./pages/UserProfilePage";
import DashboardView from "./components/views/admin/DashboardView";
import PeopleView from "./components/views/admin/PeopleView";
import AddNewUser from "./components/views/admin/PeopleView/AddNewUser";
import PersonDetail from "./components/views/admin/PeopleView/PersonDetail";
import TemplatesView from "./components/views/admin/TemplatesView";
import CreateTemplate from "./components/views/admin/TemplatesView/CreateTemplate";
import TemplateDetail from "./components/views/admin/TemplatesView/TemplateDetail";
import AskView from "./components/views/admin/AskView";
import AskDemoView from "./components/views/admin/AskDemoView";
import IntegrationsView from "./components/views/admin/IntegrationsView";
import SetupView from "./components/views/admin/SetupView";
import { useEffect } from "react";

// Navigation handler - listens for IPC navigation events from main process
function NavigationHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    // Skip if not running in Electron or preload script not ready
    if (!window.consoleAPI) {
      logger.warn(" window.consoleAPI not available - IPC navigation disabled");
      return;
    }

    // Listen for navigation requests from main process (e.g., from Agent window)
    window.consoleAPI.onNavigateToChat?.((conversationId: string) => {
      logger.info(" Navigating to chat:", conversationId);
      navigate(`/chats/${conversationId}`);
    });

    // Listen for active session navigation (from native notification click)
    window.consoleAPI.onNavigateToActiveSession?.(async () => {
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

    const unsubscribeSessionDetail = window.consoleAPI.onNavigateToSessionDetail?.((payload) => {
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
      unsubscribeEndDialog?.();
      unsubscribeSessionDetail?.();
    };
  }, [navigate]);

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

      // Invalidate session queries on any status change (paused, active, ended)
      if (state?.id) {
        queryClient.invalidateQueries({ queryKey: monitoringKeys.session(state.id) });
        queryClient.invalidateQueries({ queryKey: monitoringKeys.sessions() });
      }
    });

    return () => unsubscribe?.();
  }, [queryClient]);

  return null;
}

// Default route
function DefaultRoute() {
  const { user } = useUser();
  const { flags } = useDevFlags();

  if (user?.role === "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Navigate to={flags.newExperience ? "/calendar" : "/monitoring"} replace />;
}

// Feature gate - renders children only if the dev flag is enabled, otherwise redirects
function FeatureGate({
  flag,
  children,
}: {
  flag: keyof import("./context/DevFlagsContext").DevFlags;
  children: React.ReactNode;
}) {
  const { flags } = useDevFlags();
  if (!flags[flag]) {
    return <Navigate to="/monitoring" replace />;
  }
  return <>{children}</>;
}

// Protected route wrapper - redirects to login if not authenticated
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

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
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <TooltipProvider>
          <NavigationHandler />
          <MonitoringSessionHandler />
          <UserProvider>
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
                      <Route path="people" element={<PeopleView />} />
                      <Route path="people/new" element={<AddNewUser />} />
                      <Route path="people/:id" element={<PersonDetail />} />
                      <Route path="ask" element={<AskView />} />
                      <Route path="ask-demo" element={<AskDemoView />} />
                      <Route path="templates" element={<TemplatesView />} />
                      <Route path="templates/:id" element={<TemplateDetail />} />
                      <Route path="templates/new" element={<CreateTemplate />} />
                      <Route path="integrations" element={<IntegrationsView />} />
                      <Route path="setup" element={<SetupView />} />
                      {/* Employee Routes */}
                      <Route path="docs" element={<DocsView />} />
                      <Route path="docs/:docId" element={<DocDetail />} />
                      <Route path="artefacts" element={<ArtifactsView />} />
                      <Route path="todos" element={<TodosView />} />
                      {/* Calendar/Journal Routes (Passive Tracking) — gated behind dev flags */}
                      <Route
                        path="calendar"
                        element={
                          <FeatureGate flag="newExperience">
                            <CalendarView />
                          </FeatureGate>
                        }
                      />
                      <Route
                        path="recaps"
                        element={
                          <FeatureGate flag="newExperience">
                            <RecapsView />
                          </FeatureGate>
                        }
                      />
                      <Route
                        path="recaps/:recapId"
                        element={
                          <FeatureGate flag="newExperience">
                            <RecapDetail />
                          </FeatureGate>
                        }
                      />
                      {/* Focused Sessions Routes */}
                      <Route path="monitoring" element={<MonitoringView />} />
                      <Route path="monitoring/:sessionId" element={<SessionDetail />} />
                      <Route path="profile" element={<UserProfilePage />} />
                      {/* Legacy routes (hidden from nav but accessible via URL) */}
                      <Route path="roadmap" element={<RoadmapView />} />
                      <Route path="roadmap/task/:taskId" element={<RoadmapTaskDetail />} />
                      <Route path="chats" element={<ChatsView />} />
                      <Route path="chats/new" element={<NewChat />} />
                      <Route path="chats/:chatId" element={<ChatDetail />} />
                    </Route>
                  </Routes>
                </RecapsProvider>
              </DevFlagsProvider>
              <Toaster />
            </VariantWrapper>
          </UserProvider>
        </TooltipProvider>
      </HashRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;
