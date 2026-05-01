import React from "react";

export function PermissionRow({
  icon: Icon,
  label,
  description,
  granted,
  buttonLabel,
  onAction,
}: {
  icon: React.ElementType;
  label: string;
  description: string;
  granted: boolean;
  buttonLabel: string;
  onAction: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 0",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: "var(--bg-overlay)",
          border: "var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={18} style={{ color: "var(--text-secondary)" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: "var(--text-primary)",
            lineHeight: 1,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--text-tertiary)",
            marginTop: 4,
            lineHeight: 1,
          }}
        >
          {description}
        </div>
      </div>
      {granted ? (
        <div
          role="status"
          style={{
            padding: "6px 14px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            flexShrink: 0,
            background: "rgba(var(--status-success-rgb), 0.14)",
            color: "var(--status-success)",
            border: "0.5px solid rgba(var(--status-success-rgb), 0.28)",
          }}
        >
          Granted
        </div>
      ) : (
        <button
          type="button"
          onClick={onAction}
          style={{
            padding: "6px 14px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            color: "var(--text-primary)",
            background: "rgba(var(--ui-rgb), 0.06)",
            border: "var(--border-subtle)",
            cursor: "pointer",
            flexShrink: 0,
            transition: "background 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.06)";
          }}
        >
          {buttonLabel}
        </button>
      )}
    </div>
  );
}

export function MitableLogoMark({ size = 20 }: { size?: number }) {
  const h = Math.round((size * 100) / 92);
  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 92 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      style={{ display: "block", color: "var(--text-primary)" }}
    >
      <g clipPath="url(#mitable-logo-clip-settings)">
        <path
          d="M2 18H13.5C20.6797 18 26.5 23.8203 26.5 31V69C26.5 76.1797 20.6797 82 13.5 82C6.3203 82 0.5 76.1797 0.5 69V19.5C0.5 18.6716 1.17157 18 2 18Z"
          fill="currentColor"
        />
        <rect x="33.5" y="0.5" width="25" height="99" rx="12.5" fill="currentColor" />
        <rect x="65.5" y="18" width="26" height="64" rx="13" fill="currentColor" />
      </g>
      <defs>
        <clipPath id="mitable-logo-clip-settings">
          <rect width="92" height="100" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

export interface LinearStatus {
  connected: boolean;
  expired: boolean;
}

export interface GmailStatus {
  connected: boolean;
  expired: boolean;
  email: string | null;
}

export interface NotionStatus {
  connected: boolean;
  expired: boolean;
  workspaceId: string | null;
}

export interface GranolaStatus {
  connected: boolean;
  expired: boolean;
  email: string | null;
  lastSyncedAt: string | null;
}

export interface FirefliesStatus {
  connected: boolean;
  lastSyncedAt: string | null;
}

export interface SlackUserStatus {
  connected: boolean;
  expired: boolean;
  slackUserId: string | null;
  teamName: string | null;
  displayName: string | null;
}

export function formatPlanDisplay(
  data: { subscription: { tier: string }; isInternal: boolean } | undefined,
  isPending: boolean,
  isError: boolean
): string {
  if (isPending) return "Loading…";
  if (isError || !data?.subscription) return "Not available";
  const { tier } = data.subscription;
  const name = tier.length ? tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase() : "—";
  return data.isInternal ? `${name} (Internal)` : name;
}
