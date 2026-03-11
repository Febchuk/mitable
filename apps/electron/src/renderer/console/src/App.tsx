import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "./lib/queryClient";
import { createLogger } from "../../lib/logger";

const logger = createLogger("ConsoleApp");
import { UserProvider, useUser } from "./context/UserContext";
import { UpdateProvider } from "./context/UpdateContext";
import { VariantProvider } from "./context/VariantContext";
import { RecapsProvider } from "./context/RecapsContext";
import { DevFlagsProvider } from "./context/DevFlagsContext";
import type { OrgVariant } from "@mitable/shared";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ConsoleLayout from "./components/layout/ConsoleLayout";
import LoginPage from "./pages/LoginPage";
import SignupOrganizationPage from "./pages/SignupOrganizationPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
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
import CustomerDetailView from "./components/views/admin/DashboardView/CustomerDetailView";
import PeopleView from "./components/views/admin/PeopleView";
import AddNewUser from "./components/views/admin/PeopleView/AddNewUser";
import PersonDetail from "./components/views/admin/PeopleView/PersonDetail";
import AskView from "./components/views/admin/AskView";
import IntegrationsView from "./components/views/admin/IntegrationsView";
import SetupView from "./components/views/admin/SetupView";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import * as monitoringService from "./services/monitoringService";

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
      navigate(`/chats/${conversationId}`);
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

// Recap notification handler — polls recaps to detect NEW ones and fires OS notification.
// Does NOT rely on session status (which fires for short sessions with no recap).
function RecapNotificationHandler() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // Track "id:updatedAt" so we detect both NEW recaps and UPDATED ones (rolling daily recap)
  const knownRecapKeysRef = useRef<Set<string> | null>(null); // null = not yet initialized
  const latestRecapIdRef = useRef<string | null>(null);

  // Poll recaps directly — fires notification only when a new or updated recap appears
  const { data: recaps } = useQuery({
    queryKey: ["recap-notification-poll"],
    queryFn: async () => {
      const res = await monitoringService.fetchRecaps();
      return res.recaps;
    },
    enabled: !!user,
    refetchInterval: 10000, // check every 10s
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (!recaps) return;

    const recapKey = (r: { id: string; updatedAt: string }) => `${r.id}:${r.updatedAt}`;
    const known = knownRecapKeysRef.current;

    // First load — seed known keys, don't fire notifications
    if (known === null) {
      knownRecapKeysRef.current = new Set(recaps.map(recapKey));
      return;
    }

    // Check for new OR updated recaps
    for (const recap of recaps) {
      const key = recapKey(recap);
      if (!known.has(key)) {
        logger.info("New/updated recap detected, firing notification", {
          recapId: recap.id,
          title: recap.title,
        });

        latestRecapIdRef.current = recap.id;
        // Auto-expire after 60s so stale IDs don't trigger random navigation
        setTimeout(() => {
          if (latestRecapIdRef.current === recap.id) latestRecapIdRef.current = null;
        }, 60000);

        // Invalidate recaps cache so the UI updates immediately
        queryClient.invalidateQueries({ queryKey: monitoringKeys.recaps() });

        // Fire notification
        const notifMsg = `Your recap "${recap.title || "Work session"}" is ready to review.`;
        if (window.consoleAPI?.showRecapNotification) {
          window.consoleAPI.showRecapNotification({ title: "Recap Ready", message: notifMsg });
        } else {
          try {
            new Notification("Recap Ready", { body: notifMsg });
          } catch {
            /* ignore */
          }
        }

        // Only notify once per poll cycle (avoid double-notif if multiple recaps changed)
        break;
      }
    }

    // Update known set
    knownRecapKeysRef.current = new Set(recaps.map(recapKey));
  }, [recaps, queryClient]);

  // Navigate to recap when notification is clicked.
  // In Electron: IPC onNavigateToRecaps fires when user clicks the OS notification.
  // Fallback (non-Electron): use window focus event (assumes focus = notification click).
  useEffect(() => {
    let removeFocusListener: (() => void) | undefined;
    let unsubscribe: (() => void) | undefined;

    if (window.consoleAPI?.onNavigateToRecaps) {
      // Electron: use IPC — only fires on actual notification click, not random focus events
      unsubscribe = window.consoleAPI.onNavigateToRecaps(() => {
        const recapId = latestRecapIdRef.current;
        latestRecapIdRef.current = null;
        navigate(recapId ? `/recaps/${recapId}` : "/recaps");
      });
    } else {
      // Non-Electron fallback: navigate on window focus (best-effort)
      const handleFocus = () => {
        const recapId = latestRecapIdRef.current;
        if (recapId) {
          latestRecapIdRef.current = null;
          navigate(`/recaps/${recapId}`);
        }
      };
      window.addEventListener("focus", handleFocus);
      removeFocusListener = () => window.removeEventListener("focus", handleFocus);
    }

    return () => {
      removeFocusListener?.();
      unsubscribe?.();
    };
  }, [navigate]);

  return null;
}

// Default route
function DefaultRoute() {
  const { user } = useUser();

  if (user?.role === "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Navigate to="/calendar" replace />;
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
          <UpdateProvider>
            <UserProvider>
              <RecapNotificationHandler />
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
                        <Route path="ask" element={<AskView />} />
                        <Route path="integrations" element={<IntegrationsView />} />
                        <Route path="setup" element={<SetupView />} />
                        {/* Employee Routes */}
                        <Route path="docs" element={<DocsView />} />
                        <Route path="docs/:docId" element={<DocDetail />} />
                        <Route path="artefacts" element={<ArtifactsView />} />
                        <Route path="todos" element={<TodosView />} />
                        {/* Calendar/Journal Routes */}
                        <Route path="calendar" element={<CalendarView />} />
                        <Route path="recaps" element={<RecapsView />} />
                        <Route path="recaps/:recapId" element={<RecapDetail />} />
                        {/* Focused Sessions Routes */}
                        <Route path="monitoring" element={<MonitoringView />} />
                        <Route path="monitoring/:sessionId" element={<SessionDetail />} />
                        <Route path="profile" element={<UserProfilePage />} />
                        {/* Legacy routes (hidden from nav but accessible via URL) */}
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
          </UpdateProvider>
        </TooltipProvider>
      </HashRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;
