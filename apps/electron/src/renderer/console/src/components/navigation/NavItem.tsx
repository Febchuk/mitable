import { NavLink, useLocation } from "react-router-dom";

interface NavItemProps {
  to: string;
  icon: React.ComponentType<Record<string, unknown>>;
  label: string;
}

export default function NavItem({ to, icon: Icon, label }: NavItemProps) {
  const location = useLocation();

  const section = to.replace(/^\//, "");
  const lastPath = sessionStorage.getItem(`nav:last:${section}`);
  const resolvedTo = lastPath && lastPath.startsWith(to) ? lastPath : to;

  const isInSection = location.pathname === to || location.pathname.startsWith(to + "/");

  return (
    <NavLink
      to={resolvedTo}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        padding: "8px 12px",
        borderRadius: 6,
        margin: "1px 8px",
        fontSize: 13,
        color: isInSection ? "var(--mi-accent)" : "#9B9689",
        background: isInSection ? "rgba(var(--mi-accent-rgb, 130,192,204), 0.13)" : "transparent",
        cursor: "pointer",
        whiteSpace: "nowrap",
        textDecoration: "none",
        transition: "background 0.15s ease, color 0.15s ease",
      }}
      onMouseEnter={(e) => {
        if (!isInSection) {
          e.currentTarget.style.background = "rgba(236, 232, 224, 0.05)";
          e.currentTarget.style.color = "#ECE8E0";
        }
      }}
      onMouseLeave={(e) => {
        if (!isInSection) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "#9B9689";
        }
      }}
    >
      <Icon size={15} strokeWidth={1.5} />
      <span>{label}</span>
    </NavLink>
  );
}
