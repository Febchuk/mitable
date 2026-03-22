import { PanelLeft, Sun, Moon } from "lucide-react";
import { useSidebar } from "../../context/SidebarContext";
import { useTheme } from "../../hooks/useTheme";

const isMac = navigator.platform.toLowerCase().includes("mac");

export default function TitleBar() {
  const { open, toggle } = useSidebar();
  const { resolved, setTheme } = useTheme();

  const paddingLeft = isMac && !open ? 80 : 16;

  const toggleTheme = () => setTheme(resolved === "dark" ? "light" : "dark");

  const iconButtonStyle: React.CSSProperties = {
    width: 30,
    height: 30,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    cursor: "pointer",
    color: "var(--text-tertiary)",
    background: "none",
    border: "none",
    padding: 0,
  };

  const handleHover = (e: React.MouseEvent<HTMLButtonElement>, entering: boolean) => {
    e.currentTarget.style.background = entering ? "rgba(var(--ui-rgb), 0.06)" : "none";
    e.currentTarget.style.color = entering ? "var(--text-secondary)" : "var(--text-tertiary)";
  };

  return (
    <div
      className="app-drag"
      style={{
        height: 44,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: `0 16px 0 ${paddingLeft}px`,
        borderBottom: "none",
        flexShrink: 0,
      }}
    >
      <button
        onClick={toggle}
        className="app-no-drag"
        style={iconButtonStyle}
        onMouseEnter={(e) => handleHover(e, true)}
        onMouseLeave={(e) => handleHover(e, false)}
      >
        <PanelLeft size={16} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      </button>

      <button
        onClick={toggleTheme}
        className="app-no-drag"
        style={iconButtonStyle}
        onMouseEnter={(e) => handleHover(e, true)}
        onMouseLeave={(e) => handleHover(e, false)}
        title={resolved === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {resolved === "dark" ? (
          <Sun size={16} strokeWidth={1.5} />
        ) : (
          <Moon size={16} strokeWidth={1.5} />
        )}
      </button>
    </div>
  );
}
