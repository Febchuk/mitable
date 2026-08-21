import { RefreshCw, Loader2, ExternalLink } from "lucide-react";
import { MitableLogoMark } from "./helpers";

interface UpdateTabProps {
  appVersion: string;
  updateStatus: string;
  updateError: string;
  downloadedVersion: string;
  isCheckingForUpdates: boolean;
  handleCheckForUpdates: () => void;
  handleInstallUpdate: () => void;
}

export default function UpdateTab({
  appVersion,
  updateStatus,
  updateError,
  downloadedVersion,
  isCheckingForUpdates,
  handleCheckForUpdates,
  handleInstallUpdate,
}: UpdateTabProps) {
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
          Update
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "6px 0 0" }}>
          Check for new releases and install updates when available
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
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
            <MitableLogoMark size={20} />
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
              Mitable
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-tertiary)",
                marginTop: 4,
                lineHeight: 1,
              }}
            >
              Version {appVersion || "…"}
            </div>
          </div>
          <button
            type="button"
            onClick={updateStatus === "downloaded" ? handleInstallUpdate : handleCheckForUpdates}
            disabled={isCheckingForUpdates}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              color: "var(--text-primary)",
              background: "rgba(var(--ui-rgb), 0.06)",
              border: "var(--border-subtle)",
              cursor: isCheckingForUpdates ? "not-allowed" : "pointer",
              opacity: isCheckingForUpdates ? 0.6 : 1,
              transition: "background 0.15s ease",
              display: "flex",
              alignItems: "center",
              gap: 5,
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              if (!isCheckingForUpdates) {
                e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.1)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.06)";
            }}
          >
            {isCheckingForUpdates ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Checking…
              </>
            ) : updateStatus === "up-to-date" ? (
              "Up to date"
            ) : updateStatus === "downloaded" ? (
              <>
                <RefreshCw size={12} strokeWidth={2} />
                Install v{downloadedVersion} &amp; restart
              </>
            ) : (
              <>
                <RefreshCw size={12} strokeWidth={2} />
                Check for updates
              </>
            )}
          </button>
        </div>

        {updateStatus === "error" && updateError ? (
          <>
            <div style={{ height: 0.5, background: "var(--divider)" }} />
            <div style={{ padding: "14px 0" }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: "var(--status-error)",
                  lineHeight: 1.45,
                }}
              >
                {updateError}
              </p>
            </div>
          </>
        ) : null}

        <div style={{ height: 0.5, background: "var(--divider)" }} />
        <div style={{ paddingTop: 14 }}>
          <a
            href="https://github.com/Febchuk/mitable/releases"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              color: "var(--text-secondary)",
              textDecoration: "none",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
          >
            View release notes
            <ExternalLink size={12} strokeWidth={1.5} />
          </a>
        </div>
      </div>
    </div>
  );
}
