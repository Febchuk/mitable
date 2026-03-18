import { PanelLeft } from "lucide-react";
import { useSidebar } from "../../context/SidebarContext";

const isMac = navigator.platform.toLowerCase().includes("mac");

export default function TitleBar() {
  const { open, toggle } = useSidebar();

  // When sidebar is open, traffic lights sit over the sidebar — no extra padding needed.
  // When closed, the titlebar starts at x=0, so macOS needs left padding to clear them.
  const paddingLeft = isMac && !open ? 80 : 16;

  return (
    <div
      className="app-drag"
      style={{
        height: 44,
        display: "flex",
        alignItems: "center",
        padding: `0 16px 0 ${paddingLeft}px`,
        borderBottom: "none",
        flexShrink: 0,
      }}
    >
      <button
        onClick={toggle}
        className="app-no-drag"
        style={{
          width: 30,
          height: 30,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 6,
          cursor: "pointer",
          color: "#6B665C",
          background: "none",
          border: "none",
          padding: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(236, 232, 224, 0.06)";
          e.currentTarget.style.color = "#9B9689";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "none";
          e.currentTarget.style.color = "#6B665C";
        }}
      >
        <PanelLeft size={16} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      </button>
    </div>
  );
}
