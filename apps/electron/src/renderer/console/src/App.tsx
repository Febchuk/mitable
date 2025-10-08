import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { SidebarProvider } from "./context/SidebarContext";
import { UserProvider } from "./context/UserContext";
import { RoadmapProvider } from "./context/RoadmapContext";
import ConsoleLayout from "./components/layout/ConsoleLayout";
import HomeView from "./components/views/HomeView";
import RoadmapView from "./components/views/RoadmapView";
import NudgesView from "./components/views/NudgesView";
import ChatsView from "./components/views/ChatsView";

function App() {
  return (
    <HashRouter>
      <SidebarProvider>
        <UserProvider>
          <RoadmapProvider>
            <Routes>
              <Route path="/" element={<ConsoleLayout />}>
                <Route index element={<Navigate to="/home" replace />} />
                <Route path="home" element={<HomeView />} />
                <Route path="roadmap" element={<RoadmapView />} />
                <Route path="nudges" element={<NudgesView />} />
                <Route path="chats" element={<ChatsView />} />
              </Route>
            </Routes>
          </RoadmapProvider>
        </UserProvider>
      </SidebarProvider>
    </HashRouter>
  );
}

export default App;
