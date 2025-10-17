import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "./lib/queryClient";
import { UserProvider, useUser } from "./context/UserContext";
import { Toaster } from "@/components/ui/toaster";
import ConsoleLayout from "./components/layout/ConsoleLayout";
import LoginPage from "./pages/LoginPage";
import SignupOrganizationPage from "./pages/SignupOrganizationPage";
import HomeView from "./components/views/employee/HomeView";
import RoadmapView from "./components/views/employee/RoadmapView";
import RoadmapTaskDetail from "./components/views/employee/RoadmapView/RoadmapTaskDetail";
import NudgesView from "./components/views/employee/NudgesView";
import NudgeDetail from "./components/views/employee/NudgesView/NudgeDetail";
import ChatsView from "./components/views/employee/ChatsView";
import ChatDetail from "./components/views/employee/ChatsView/ChatDetail";
import NewChat from "./components/views/employee/ChatsView/NewChat";
import DashboardView from "./components/views/admin/DashboardView";
import PeopleView from "./components/views/admin/PeopleView";
import AddNewUser from "./components/views/admin/PeopleView/AddNewUser";
import PersonDetail from "./components/views/admin/PeopleView/PersonDetail";
import TemplatesView from "./components/views/admin/TemplatesView";
import CreateTemplate from "./components/views/admin/TemplatesView/CreateTemplate";
import IntegrationsView from "./components/views/admin/IntegrationsView";
import SetupView from "./components/views/admin/SetupView";

// Dynamic default route based on user role
function DefaultRoute() {
  const { user } = useUser();
  const defaultPath = user?.role === "admin" ? "/dashboard" : "/home";
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
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
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
              <Route path="templates/new" element={<CreateTemplate />} />
              <Route path="integrations" element={<IntegrationsView />} />
              <Route path="setup" element={<SetupView />} />
              {/* Employee Routes */}
              <Route path="home" element={<HomeView />} />
              <Route path="roadmap" element={<RoadmapView />} />
              <Route path="roadmap/task/:taskId" element={<RoadmapTaskDetail />} />
              <Route path="nudges" element={<NudgesView />} />
              <Route path="nudges/:nudgeId" element={<NudgeDetail />} />
              <Route path="chats" element={<ChatsView />} />
              <Route path="chats/new" element={<NewChat />} />
              <Route path="chats/:chatId" element={<ChatDetail />} />
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
