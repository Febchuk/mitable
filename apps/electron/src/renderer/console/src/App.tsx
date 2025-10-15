import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { UserProvider, useUser } from "./context/UserContext";
import { AdminProvider } from "./context/AdminContext";
import { RoadmapProvider } from "./context/RoadmapContext";
import { NudgesProvider } from "./context/NudgesContext";
import { ChatsProvider } from "./context/ChatsContext";
import ConsoleLayout from "./components/layout/ConsoleLayout";
import HomeView from "./components/views/employee/HomeView";
import RoadmapView from "./components/views/employee/RoadmapView";
import RoadmapTaskDetail from "./components/views/employee/RoadmapView/RoadmapTaskDetail";
import NudgesView from "./components/views/employee/NudgesView";
import NudgeDetail from "./components/views/employee/NudgesView/NudgeDetail";
import ChatsView from "./components/views/employee/ChatsView";
import DashboardView from "./components/views/admin/DashboardView";
import PeopleView from "./components/views/admin/PeopleView";
import AddNewUser from "./components/views/admin/PeopleView/AddNewUser";
import PersonDetail from "./components/views/admin/PeopleView/PersonDetail";
import RoadmapsView from "./components/views/admin/RoadmapsView";
import CreateRoadmap from "./components/views/admin/RoadmapsView/CreateRoadmap";
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
                    <Route path="people" element={<PeopleView />} />
                    <Route path="people/new" element={<AddNewUser />} />
                    <Route path="people/:id" element={<PersonDetail />} />
                    <Route path="roadmaps" element={<RoadmapsView />} />
                    <Route path="roadmaps/new" element={<CreateRoadmap />} />
                    <Route path="integrations" element={<IntegrationsView />} />
                    <Route path="setup" element={<SetupView />} />
                    {/* Employee Routes */}
                    <Route path="home" element={<HomeView />} />
                    <Route path="roadmap" element={<RoadmapView />} />
                    <Route path="roadmap/task/:taskId" element={<RoadmapTaskDetail />} />
                    <Route path="nudges" element={<NudgesView />} />
                    <Route path="nudges/:nudgeId" element={<NudgeDetail />} />
                    <Route path="chats" element={<ChatsView />} />
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
