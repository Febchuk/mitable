import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { SidebarProvider } from "./context/SidebarContext";
import { UserProvider, useUser } from "./context/UserContext";
import { AdminProvider } from "./context/AdminContext";
import { RoadmapProvider } from "./context/RoadmapContext";
import { NudgesProvider } from "./context/NudgesContext";
import { ChatsProvider } from "./context/ChatsContext";
import ConsoleLayout from "./components/layout/ConsoleLayout";
import HomeView from "./components/views/employee/HomeView";
import RoadmapView from "./components/views/employee/RoadmapView";
import NudgesView from "./components/views/employee/NudgesView";
import ChatsView from "./components/views/employee/ChatsView";
import DashboardView from "./components/views/admin/DashboardView";
import IntegrationsView from "./components/views/admin/IntegrationsView";
import SetupView from "./components/views/admin/SetupView";

// Dynamic default route based on user role
function DefaultRoute() {
  const { user } = useUser();
  const defaultPath = user?.role === "admin" ? "/dashboard" : "/home";
  return <Navigate to={defaultPath} replace />;
}

function App() {
  return (
    <HashRouter>
      <SidebarProvider>
        <UserProvider>
          <AdminProvider>
            <RoadmapProvider>
              <NudgesProvider>
                <ChatsProvider>
                  <Routes>
                    <Route path="/" element={<ConsoleLayout />}>
                      <Route index element={<DefaultRoute />} />
                      {/* Admin Routes */}
                      <Route path="dashboard" element={<DashboardView />} />
                      <Route path="integrations" element={<IntegrationsView />} />
                      <Route path="setup" element={<SetupView />} />
                      {/* Employee Routes */}
                      <Route path="home" element={<HomeView />} />
                      <Route path="roadmap" element={<RoadmapView />} />
                      <Route path="nudges" element={<NudgesView />} />
                      <Route path="chats" element={<ChatsView />} />
                    </Route>
                  </Routes>
                </ChatsProvider>
              </NudgesProvider>
            </RoadmapProvider>
          </AdminProvider>
        </UserProvider>
      </SidebarProvider>
    </HashRouter>
  );
}

export default App;
