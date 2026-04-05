import { useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { SidebarProvider } from "../../context/SidebarContext";
import Sidebar from "./Sidebar";
import TitleBar from "./TitleBar";
import UpdateBanner from "./UpdateBanner";
import { createLogger } from "../../../../lib/logger";

const logger = createLogger("ConsoleLayout");

export default function ConsoleLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isFullWidthPage =
    location.pathname === "/profile" ||
    location.pathname === "/me" ||
    location.pathname === "/dashboard" ||
    location.pathname === "/bragbook" ||
    location.pathname === "/org-setup" ||
    location.pathname.startsWith("/people/") ||
    location.pathname.startsWith("/agent");

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
        style={{ background: "var(--bg-base)", fontFamily: "var(--font-sans)" }}
      >
        <Sidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <TitleBar />
          <UpdateBanner />

          <div
            className={`flex-1 flex flex-col${isFullWidthPage ? " overflow-hidden" : " overflow-y-auto items-center"}`}
            style={{ padding: isFullWidthPage ? 0 : "20px 0" }}
          >
            <div
              className="w-full flex flex-col"
              style={
                isFullWidthPage
                  ? { flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }
                  : { maxWidth: 680, padding: "0 40px", gap: 28 }
              }
            >
              <Outlet />
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
