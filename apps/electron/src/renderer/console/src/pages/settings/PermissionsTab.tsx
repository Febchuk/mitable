import { Monitor, MousePointerClick } from "lucide-react";
import { PermissionRow } from "./helpers";

interface PermissionsTabProps {
  screenPermission: boolean;
  accessibilityPermission: boolean;
  requestAccessibility: () => void;
  openScreenRecording: () => void;
}

export default function PermissionsTab({
  screenPermission,
  accessibilityPermission,
  requestAccessibility,
  openScreenRecording,
}: PermissionsTabProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div
        style={{
          paddingBottom: 16,
          borderBottom: "var(--border-hairline)",
        }}
      >
        <h2
          style={{
            fontSize: 16,
            fontWeight: 500,
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          macOS Permissions
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "6px 0 0" }}>
          Mitable needs these permissions to capture your work
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <PermissionRow
          icon={Monitor}
          label="Screen Recording"
          description="Required to capture screenshots"
          granted={screenPermission}
          buttonLabel="Open Settings"
          onAction={openScreenRecording}
        />
        <div style={{ height: 0.5, background: "var(--divider)" }} />
        <PermissionRow
          icon={MousePointerClick}
          label="Accessibility"
          description="Required to track keyboard & mouse activity"
          granted={accessibilityPermission}
          buttonLabel="Grant Access"
          onAction={requestAccessibility}
        />
      </div>
    </div>
  );
}
