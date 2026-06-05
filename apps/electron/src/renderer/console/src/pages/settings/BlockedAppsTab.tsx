import { useState } from "react";
import { X, Loader2, RefreshCw, Search, ShieldBan } from "lucide-react";
import { Button as ShadcnButton } from "@/components/ui/button";

const MITABLE_PATTERNS = [/^@?mitable/i, /^electron$/i];
function isMitableApp(name: string): boolean {
  return MITABLE_PATTERNS.some((p) => p.test(name));
}

const AVATAR_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#6d28d9",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function AppIcon({
  name,
  iconDataUrl,
  size = 28,
}: {
  name: string;
  iconDataUrl?: string;
  size?: number;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  if (iconDataUrl && !imgFailed) {
    return (
      <img
        src={iconDataUrl}
        alt=""
        onError={() => setImgFailed(true)}
        style={{
          width: size,
          height: size,
          borderRadius: 6,
          objectFit: "contain",
          flexShrink: 0,
        }}
      />
    );
  }

  const letter = (name || "?").charAt(0).toUpperCase();
  const bg = getAvatarColor(name);

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontSize: size * 0.45,
        fontWeight: 600,
        color: "#fff",
        lineHeight: 1,
      }}
    >
      {letter}
    </div>
  );
}

interface DetectedApp {
  normalizedName: string;
  originalName: string;
  source: "detected" | "installed" | "both";
  iconDataUrl?: string;
}

interface BlockedAppsTabProps {
  isBlockListLoading: boolean;
  blockedApps: string[];
  detectedApps: DetectedApp[];
  handleRemoveBlockedApp: (appName: string) => void;
  handleRefreshAppList: () => void;
  isRefreshingApps: boolean;
  appSearchQuery: string;
  setAppSearchQuery: (query: string) => void;
  handleAddBlockedApp: (appName: string) => void;
  cleanAppName: (appName: string) => string;
}

export default function BlockedAppsTab({
  isBlockListLoading,
  blockedApps,
  detectedApps,
  handleRemoveBlockedApp,
  handleRefreshAppList,
  isRefreshingApps,
  appSearchQuery,
  setAppSearchQuery,
  handleAddBlockedApp,
  cleanAppName,
}: BlockedAppsTabProps) {
  const visibleBlockedApps = blockedApps.filter((name) => !isMitableApp(name));

  const filteredApps = detectedApps
    .filter((app) => !blockedApps.includes(app.normalizedName))
    .filter((app) => !isMitableApp(app.normalizedName) && !isMitableApp(app.originalName))
    .filter((app) => {
      if (!appSearchQuery.trim()) return true;
      const query = appSearchQuery.toLowerCase();
      return app.originalName.toLowerCase().includes(query) || app.normalizedName.includes(query);
    });

  if (isBlockListLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 300,
        }}
      >
        <Loader2 className="animate-spin" size={24} style={{ color: "var(--text-tertiary)" }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div>
        <h2
          style={{
            fontSize: 18,
            fontWeight: 500,
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          Blocked Apps
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-tertiary)",
            margin: "8px 0 0",
            lineHeight: 1.5,
          }}
        >
          Apps in this list will never be tracked or captured during sessions.
        </p>
      </div>

      {/* Currently blocked chips */}
      {visibleBlockedApps.length > 0 ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            padding: "16px 20px",
            borderRadius: 12,
            border: "var(--border-hairline)",
            background: "rgba(var(--ui-rgb), 0.02)",
          }}
        >
          {visibleBlockedApps.map((appName) => {
            const detectedApp = detectedApps.find(
              (a) => a.normalizedName === appName.toLowerCase()
            );
            const displayName = cleanAppName(detectedApp?.originalName || appName);
            return (
              <div
                key={appName}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "4px 8px 4px 5px",
                  borderRadius: 999,
                  border: "var(--border-subtle)",
                  background: "rgba(var(--ui-rgb), 0.04)",
                  fontSize: 13,
                  color: "var(--text-primary)",
                  transition: "background 0.15s ease",
                }}
              >
                <AppIcon name={displayName} iconDataUrl={detectedApp?.iconDataUrl} size={22} />
                <span>{displayName}</span>
                <button
                  onClick={() => handleRemoveBlockedApp(appName)}
                  style={{
                    width: 18,
                    height: 18,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "50%",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    color: "var(--text-tertiary)",
                    transition: "background 0.15s ease, color 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.1)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "var(--text-tertiary)";
                  }}
                  aria-label={`Unblock ${displayName}`}
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            padding: "28px 20px",
            borderRadius: 12,
            border: "var(--border-hairline)",
            background: "rgba(var(--ui-rgb), 0.02)",
          }}
        >
          <ShieldBan size={28} style={{ color: "var(--text-tertiary)", opacity: 0.5 }} />
          <p
            style={{
              fontSize: 13,
              color: "var(--text-tertiary)",
              margin: 0,
              fontStyle: "italic",
            }}
          >
            No apps are currently blocked
          </p>
        </div>
      )}

      {/* Search + app list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-secondary)",
            }}
          >
            Add App to Block List
          </span>
          <ShadcnButton
            variant="ghost"
            size="sm"
            onClick={handleRefreshAppList}
            disabled={isRefreshingApps}
            className="h-7 px-2 text-xs text-text-tertiary hover:text-text-primary"
          >
            {isRefreshingApps ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : (
              <RefreshCw className="w-3 h-3 mr-1" />
            )}
            Refresh
          </ShadcnButton>
        </div>

        {isRefreshingApps && detectedApps.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "32px 0",
              gap: 8,
            }}
          >
            <Loader2 className="animate-spin" size={18} style={{ color: "var(--text-tertiary)" }} />
            <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
              Scanning installed apps...
            </span>
          </div>
        ) : detectedApps.length === 0 ? (
          <p
            style={{
              fontSize: 13,
              color: "var(--text-tertiary)",
              fontStyle: "italic",
              textAlign: "center",
              padding: "24px 0",
            }}
          >
            No apps found. Click Refresh to scan for installed apps.
          </p>
        ) : (
          <>
            {/* Search bar */}
            <div style={{ position: "relative" }}>
              <Search
                size={16}
                style={{
                  position: "absolute",
                  left: 14,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-tertiary)",
                  pointerEvents: "none",
                }}
              />
              <input
                type="text"
                placeholder="Search apps..."
                value={appSearchQuery}
                onChange={(e) => setAppSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  height: 42,
                  paddingLeft: 40,
                  paddingRight: appSearchQuery ? 36 : 14,
                  borderRadius: 10,
                  border: "var(--border-subtle)",
                  background: "rgba(var(--ui-rgb), 0.03)",
                  fontSize: 14,
                  color: "var(--text-primary)",
                  outline: "none",
                  transition: "border-color 0.15s ease",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--mi-accent)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "";
                }}
              />
              {appSearchQuery && (
                <button
                  onClick={() => setAppSearchQuery("")}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "var(--text-tertiary)",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* App list */}
            <div
              style={{
                maxHeight: "calc(100vh - 420px)",
                minHeight: 200,
                overflowY: "auto",
                borderRadius: 10,
                border: "var(--border-hairline)",
              }}
            >
              {filteredApps.length === 0 ? (
                <div
                  style={{
                    padding: "28px 16px",
                    textAlign: "center",
                    fontSize: 13,
                    color: "var(--text-tertiary)",
                    fontStyle: "italic",
                  }}
                >
                  {appSearchQuery ? "No apps match your search" : "All apps are already blocked"}
                </div>
              ) : (
                filteredApps.map((app, idx) => {
                  const displayName = cleanAppName(app.originalName);
                  const isInstalledOnly = app.source === "installed";
                  return (
                    <button
                      key={app.normalizedName}
                      onClick={() => handleAddBlockedApp(app.normalizedName)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "8px 16px",
                        background: "transparent",
                        border: "none",
                        borderBottom:
                          idx < filteredApps.length - 1 ? "var(--border-hairline)" : "none",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "background 0.1s ease",
                        minHeight: 48,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.04)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <AppIcon name={displayName} iconDataUrl={app.iconDataUrl} size={28} />
                      <span
                        style={{
                          fontSize: 14,
                          color: "var(--text-primary)",
                          flex: 1,
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {displayName}
                      </span>
                      {isInstalledOnly && (
                        <span
                          style={{
                            fontSize: 10,
                            color: "var(--text-tertiary)",
                            background: "rgba(var(--ui-rgb), 0.05)",
                            padding: "2px 8px",
                            borderRadius: 4,
                            flexShrink: 0,
                          }}
                        >
                          not opened
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Count */}
            <p
              style={{
                fontSize: 11,
                color: "var(--text-tertiary)",
                margin: 0,
              }}
            >
              {filteredApps.length} app{filteredApps.length !== 1 ? "s" : ""} available
            </p>
          </>
        )}
      </div>
    </div>
  );
}
