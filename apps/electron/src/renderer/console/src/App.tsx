import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { UserProvider, useUser } from "./context/UserContext";
import { AdminProvider } from "./context/AdminContext";
import { RoadmapProvider } from "./context/RoadmapContext";
import { NudgesProvider } from "./context/NudgesContext";
import { ChatsProvider } from "./context/ChatsContext";
import ConsoleLayout from "./components/layout/ConsoleLayout";
import LoginPage from "./pages/LoginPage";
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
    <HashRouter>
      <UserProvider>
        <AdminProvider>
          <RoadmapProvider>
            <NudgesProvider>
              <ChatsProvider>
                <Routes>
                  {/* Public route */}
                  <Route path="/login" element={<LoginPage />} />

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
              </ChatsProvider>
            </NudgesProvider>
          </RoadmapProvider>
        </AdminProvider>
      </UserProvider>
    </HashRouter>
  );
}

export default App;
