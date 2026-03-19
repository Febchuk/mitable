import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { SidebarProvider } from "../../context/SidebarContext";
import Sidebar from "./Sidebar";
import TitleBar from "./TitleBar";
import UpdateBanner from "./UpdateBanner";
import { createLogger } from "../../../../lib/logger";

const logger = createLogger("ConsoleLayout");

export default function ConsoleLayout() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleDraftsNavigate = (draftId: string) => {
      logger.info("Navigating to draft:", draftId);
      navigate(`/drafts/${draftId}`);
    };

    const unsubscribe = window.consoleAPI?.onDraftsNavigate?.(handleDraftsNavigate);

    return () => {
      unsubscribe?.();
    };
  }, [navigate]);

  return (
    <SidebarProvider>
      <div
        className="flex h-screen overflow-hidden"
        style={{ background: "#1A1916", fontFamily: "var(--font-sans)" }}
      >
        <Sidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <TitleBar />
          <UpdateBanner />

          <div
            className="flex-1 overflow-y-auto flex flex-col items-center"
            style={{ padding: "20px 0" }}
          >
            <div
              className="w-full flex flex-col"
              style={{ maxWidth: 800, padding: "0 32px", gap: 28 }}
            >
              <Outlet />
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
