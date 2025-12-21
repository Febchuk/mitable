import { HashRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "./lib/queryClient";
import { UserProvider, useUser } from "./context/UserContext";
import { Toaster } from "@/components/ui/toaster";
import ConsoleLayout from "./components/layout/ConsoleLayout";
import LoginPage from "./pages/LoginPage";
import SignupOrganizationPage from "./pages/SignupOrganizationPage";
import RoadmapView from "./components/views/employee/RoadmapView";
import RoadmapTaskDetail from "./components/views/employee/RoadmapView/RoadmapTaskDetail";
import NudgesView from "./components/views/employee/NudgesView";
import NudgeDetail from "./components/views/employee/NudgesView/NudgeDetail";
import CreateNudge from "./components/views/employee/NudgesView/CreateNudge";
import ChatsView from "./components/views/employee/ChatsView";
import ChatDetail from "./components/views/employee/ChatsView/ChatDetail";
import NewChat from "./components/views/employee/ChatsView/NewChat";
import MonitoringView from "./components/views/employee/MonitoringView";
import SessionDetail from "./components/views/employee/MonitoringView/SessionDetail";
import SettingsView from "./components/views/employee/SettingsView";
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
    // Listen for navigation requests from main process (e.g., from Agent window)
    window.consoleAPI.onNavigateToChat((conversationId: string) => {
      console.log("[Console] Navigating to chat:", conversationId);
      navigate(`/chats/${conversationId}`);
    });

    // Listen for active session navigation (from native notification click)
    window.consoleAPI.onNavigateToActiveSession(async () => {
      console.log("[Console] Navigate to active session requested");
      try {
        const sessionState = await window.consoleAPI.getMonitoringSessionState();
        if (sessionState?.id) {
          console.log("[Console] Navigating to active session:", sessionState.id);
          navigate(`/monitoring/${sessionState.id}`);
        } else {
          console.log("[Console] No active session found, navigating to monitoring view");
          navigate("/monitoring");
        }
      } catch (error) {
        console.error("[Console] Error getting session state:", error);
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
    window.consoleAPI.onMonitoringSessionUpdate((state) => {
      console.log("[Console] Monitoring session update:", state?.status, state?.id);

      // Invalidate session queries on any status change (paused, active, ended)
      if (state?.id) {
        queryClient.invalidateQueries({ queryKey: ["monitoring", "session", state.id] });
        queryClient.invalidateQueries({ queryKey: ["monitoring", "sessions"] });
      }
    });
  }, [queryClient]);

  return null;
}

// Dynamic default route based on user role
function DefaultRoute() {
  const { user } = useUser();
  const defaultPath = user?.role === "admin" ? "/dashboard" : "/monitoring";
  return <Navigate to={defaultPath} replace />;
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
    console.log("[CONFIG] Console App Environment:", {
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
              <Route path="roadmap" element={<RoadmapView />} />
              <Route path="roadmap/task/:taskId" element={<RoadmapTaskDetail />} />
              <Route path="nudges" element={<NudgesView />} />
              <Route path="nudges/new" element={<CreateNudge />} />
              <Route path="nudges/:nudgeId" element={<NudgeDetail />} />
              <Route path="chats" element={<ChatsView />} />
              <Route path="chats/new" element={<NewChat />} />
              <Route path="chats/:chatId" element={<ChatDetail />} />
              {/* Monitoring Routes */}
              <Route path="monitoring" element={<MonitoringView />} />
              <Route path="monitoring/:sessionId" element={<SessionDetail />} />
              <Route path="settings" element={<SettingsView />} />
            </Route>
          </Routes>
          <Toaster />
        </UserProvider>
      </HashRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;
