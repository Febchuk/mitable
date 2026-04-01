import NavItem from "./NavItem";

interface NavGroupProps {
  to: string;
  icon: React.ComponentType<Record<string, unknown>>;
  label: string;
  children: React.ReactNode;
}

export default function NavGroup({ to, icon, label, children }: NavGroupProps) {
  return (
    <div>
      <NavItem to={to} icon={icon} label={label} />
      <div style={{ position: "relative", marginLeft: 20 }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 1,
            background: "var(--text-secondary)",
            opacity: 0.2,
            borderRadius: 1,
          }}
        />
        <div style={{ paddingLeft: 12 }}>{children}</div>
      </div>
    </div>
  );
}
