import { useState } from "react";
import { Settings, Shield, Network } from "lucide-react";
import SetupView from "../SetupView";
import OrgChartView from "../OrgChartView";
import PermissionsTab from "./PermissionsTab";

type OrgSetupSection = "general" | "permissions" | "org-chart";

const SECTIONS: { id: OrgSetupSection; label: string; icon: typeof Settings }[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "permissions", label: "Permissions", icon: Shield },
  { id: "org-chart", label: "Org Chart", icon: Network },
];

export default function OrgSetupView() {
  const [activeSection, setActiveSection] = useState<OrgSetupSection>("general");

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      {/* Sidebar navigation — matches Settings page layout */}
      <div
        style={{
          width: 200,
          minWidth: 200,
          borderRight: "var(--border-hairline)",
          padding: "28px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          overflowY: "auto",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 18,
            color: "var(--text-primary)",
            fontWeight: 400,
            letterSpacing: "-0.2px",
            margin: "0 0 16px",
            padding: "0 10px",
          }}
        >
          Org Setup
        </h2>
        {SECTIONS.map((section) => {
          const isActive = activeSection === section.id;
          return (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "8px 10px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 400,
                color: isActive ? "var(--text-primary)" : "var(--text-tertiary)",
                background: isActive ? "rgba(var(--ui-rgb), 0.06)" : "none",
                border: "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
                textAlign: "left",
                width: "100%",
                transition: "color 0.15s ease, background 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = "var(--text-secondary)";
                  e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.03)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = "var(--text-tertiary)";
                  e.currentTarget.style.background = "none";
                }
              }}
            >
              <section.icon size={14} strokeWidth={1.5} />
              {section.label}
            </button>
          );
        })}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {activeSection === "general" && <SetupView />}
        {activeSection === "permissions" && <PermissionsTab />}
        {activeSection === "org-chart" && (
          <div style={{ padding: "24px 32px" }}>
            <OrgChartView />
          </div>
        )}
      </div>
    </div>
  );
}
