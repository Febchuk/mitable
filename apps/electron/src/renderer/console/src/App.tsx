import { HashRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "./lib/queryClient";
import { createLogger } from "../../lib/logger";

const logger = createLogger("ConsoleApp");
import { UserProvider, useUser } from "./context/UserContext";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ConsoleLayout from "./components/layout/ConsoleLayout";
import LoginPage from "./pages/LoginPage";
import SignupOrganizationPage from "./pages/SignupOrganizationPage";
import RoadmapView from "./components/views/employee/RoadmapView";
import RoadmapTaskDetail from "./components/views/employee/RoadmapView/RoadmapTaskDetail";
import ChatsView from "./components/views/employee/ChatsView";
import ChatDetail from "./components/views/employee/ChatsView/ChatDetail";
import NewChat from "./components/views/employee/ChatsView/NewChat";
import MonitoringView from "./components/views/employee/MonitoringView";
import SessionDetail from "./components/views/employee/MonitoringView/SessionDetail";
import { monitoringKeys } from "./hooks/queries/monitoring";
import SettingsView from "./components/views/employee/SettingsView";
import DocsView from "./components/views/employee/DocsView";
import DocDetail from "./components/views/employee/DocsView/DocDetail";
import TodosView from "./components/views/employee/TodosView";
import UploadView from "./components/views/employee/UploadView";
import DashboardView from "./components/views/admin/DashboardView";
import PeopleView from "./components/views/admin/PeopleView";
import AddNewUser from "./components/views/admin/PeopleView/AddNewUser";
import PersonDetail from "./components/views/admin/PeopleView/PersonDetail";
import TemplatesView from "./components/views/admin/TemplatesView";
import CreateTemplate from "./components/views/admin/TemplatesView/CreateTemplate";
import TemplateDetail from "./components/views/admin/TemplatesView/TemplateDetail";
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

// Default route - all users start at Sessions (/monitoring)
function DefaultRoute() {
  return <Navigate to="/monitoring" replace />;
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
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup-organization" element={<SignupOrganizationPage />} />

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
                <Route path="templates" element={<TemplatesView />} />
                <Route path="templates/:id" element={<TemplateDetail />} />
                <Route path="templates/new" element={<CreateTemplate />} />
                <Route path="integrations" element={<IntegrationsView />} />
                <Route path="setup" element={<SetupView />} />
                {/* Employee Routes */}
                <Route path="docs" element={<DocsView />} />
                <Route path="docs/:docId" element={<DocDetail />} />
                <Route path="todos" element={<TodosView />} />
                <Route path="upload" element={<UploadView />} />
                {/* Monitoring Routes */}
                <Route path="monitoring" element={<MonitoringView />} />
                <Route path="monitoring/:sessionId" element={<SessionDetail />} />
                <Route path="settings" element={<SettingsView />} />
                {/* Legacy routes (hidden from nav but accessible via URL) */}
                <Route path="roadmap" element={<RoadmapView />} />
                <Route path="roadmap/task/:taskId" element={<RoadmapTaskDetail />} />
                <Route path="chats" element={<ChatsView />} />
                <Route path="chats/new" element={<NewChat />} />
                <Route path="chats/:chatId" element={<ChatDetail />} />
              </Route>
            </Routes>
            <Toaster />
          </UserProvider>
        </TooltipProvider>
      </HashRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;
