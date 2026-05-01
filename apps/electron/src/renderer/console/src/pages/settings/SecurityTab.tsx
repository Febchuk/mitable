import { FormEvent } from "react";
import { Eye, EyeOff, Check, X, Loader2, RefreshCw, Plus, Search } from "lucide-react";
import { Button as ShadcnButton } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface DetectedApp {
  normalizedName: string;
  originalName: string;
  source: "detected" | "installed" | "both";
}

interface SecurityTabProps {
  // Block list
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

  // Password change
  currentPassword: string;
  setCurrentPassword: (pw: string) => void;
  newPassword: string;
  setNewPassword: (pw: string) => void;
  confirmPassword: string;
  setConfirmPassword: (pw: string) => void;
  showCurrentPassword: boolean;
  setShowCurrentPassword: (show: boolean) => void;
  showNewPassword: boolean;
  setShowNewPassword: (show: boolean) => void;
  showConfirmPassword: boolean;
  setShowConfirmPassword: (show: boolean) => void;
  isChangingPassword: boolean;
  handlePasswordChange: (e: FormEvent) => void;
}

type PasswordStrength = "weak" | "medium" | "strong";

const strengthColors: Record<PasswordStrength, string> = {
  weak: "bg-red-500",
  medium: "bg-yellow-500",
  strong: "bg-green-500",
};

const strengthWidth: Record<PasswordStrength, string> = {
  weak: "w-1/3",
  medium: "w-2/3",
  strong: "w-full",
};

const requirements = [
  { label: "At least 8 characters", test: (pw: string) => pw.length >= 8 },
  { label: "Contains uppercase letter", test: (pw: string) => /[A-Z]/.test(pw) },
  { label: "Contains lowercase letter", test: (pw: string) => /[a-z]/.test(pw) },
  { label: "Contains number", test: (pw: string) => /[0-9]/.test(pw) },
];

function getPasswordStrength(password: string): PasswordStrength {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 2) return "weak";
  if (score <= 4) return "medium";
  return "strong";
}

export default function SecurityTab({
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
  currentPassword,
  setCurrentPassword,
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  showCurrentPassword,
  setShowCurrentPassword,
  showNewPassword,
  setShowNewPassword,
  showConfirmPassword,
  setShowConfirmPassword,
  isChangingPassword,
  handlePasswordChange,
}: SecurityTabProps) {
  const passwordStrength = getPasswordStrength(newPassword);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Block List Section */}
        <div
          style={{
            paddingBottom: 24,
            borderBottom: "var(--border-hairline)",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <h3
            style={{
              fontSize: 16,
              fontWeight: 500,
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            Blocked Apps
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0 }}>
            Apps in this list will never be tracked or captured.
          </p>

          {isBlockListLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
            </div>
          ) : (
            <>
              {/* Currently Blocked Apps */}
              <div className="space-y-3">
                <Label className="text-sm font-medium text-text-primary">Blocked Apps</Label>
                {blockedApps.length === 0 ? (
                  <p className="text-xs text-text-tertiary italic">No apps are currently blocked</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {blockedApps.map((appName) => {
                      const detectedApp = detectedApps.find(
                        (a) => a.normalizedName === appName.toLowerCase()
                      );
                      const displayName = cleanAppName(detectedApp?.originalName || appName);
                      return (
                        <div
                          key={appName}
                          className="flex items-center gap-1.5 bg-muted border border-border rounded-full pl-3 pr-2 py-1"
                        >
                          <span className="text-xs text-foreground">{displayName}</span>
                          <button
                            onClick={() => handleRemoveBlockedApp(appName)}
                            className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-accent transition-colors"
                            aria-label={`Unblock ${displayName}`}
                          >
                            <X size={10} className="text-muted-foreground" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Available Apps to Block */}
              <div className="space-y-4 pt-1">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm font-medium text-text-primary">
                    Add App to Block List
                  </Label>
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
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-text-tertiary mr-2" />
                    <span className="text-xs text-text-tertiary">Scanning installed apps...</span>
                  </div>
                ) : detectedApps.length === 0 ? (
                  <p className="text-xs text-text-tertiary italic">
                    No apps found. Click Refresh to scan for installed apps on your system.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {/* Search input */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search apps..."
                        value={appSearchQuery}
                        onChange={(e) => setAppSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-9 py-2.5 text-sm bg-background-secondary border border-border-subtle rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent-blue"
                      />
                      {appSearchQuery && (
                        <button
                          onClick={() => setAppSearchQuery("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary hover:text-text-primary"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    {/* App list */}
                    <div className="max-h-48 overflow-y-auto border border-border-subtle rounded-lg py-2">
                      {(() => {
                        const filteredApps = detectedApps
                          .filter((app) => !blockedApps.includes(app.normalizedName))
                          .filter((app) => {
                            if (!appSearchQuery.trim()) return true;
                            const query = appSearchQuery.toLowerCase();
                            return (
                              app.originalName.toLowerCase().includes(query) ||
                              app.normalizedName.includes(query)
                            );
                          });

                        if (filteredApps.length === 0) {
                          return (
                            <div className="px-4 py-4 text-xs text-text-tertiary italic">
                              {appSearchQuery
                                ? "No apps match your search"
                                : "All apps are already blocked"}
                            </div>
                          );
                        }

                        return filteredApps.map((app) => {
                          const displayName = cleanAppName(app.originalName);
                          const isInstalledOnly = app.source === "installed";
                          return (
                            <button
                              key={app.normalizedName}
                              onClick={() => handleAddBlockedApp(app.normalizedName)}
                              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-background-secondary transition-colors text-left min-h-[44px]"
                            >
                              <Plus size={14} className="text-text-tertiary shrink-0" />
                              <span className="text-sm text-text-primary flex-1 min-w-0 truncate">
                                {displayName}
                              </span>
                              {isInstalledOnly && (
                                <span className="text-[10px] text-text-tertiary bg-background-secondary px-2 py-0.5 rounded shrink-0 mr-0.5">
                                  not opened
                                </span>
                              )}
                            </button>
                          );
                        });
                      })()}
                    </div>
                    {/* App count */}
                    <p className="text-[10px] text-text-tertiary pt-0.5">
                      {
                        detectedApps.filter((app) => !blockedApps.includes(app.normalizedName))
                          .length
                      }{" "}
                      apps available
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div>
          <h2
            style={{
              fontSize: 16,
              fontWeight: 500,
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            Change Password
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-tertiary)",
              margin: "6px 0 0",
            }}
          >
            Update your password to keep your account secure
          </p>
        </div>

        <form
          onSubmit={handlePasswordChange}
          style={{ display: "flex", flexDirection: "column", gap: 20 }}
        >
          {/* Current Password */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label
              htmlFor="currentPassword"
              style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}
            >
              Current Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="currentPassword"
                type={showCurrentPassword ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                disabled={isChangingPassword}
                placeholder="Enter your current password"
                style={{
                  width: "100%",
                  height: 38,
                  borderRadius: 6,
                  border: "var(--border-subtle)",
                  background: "rgba(var(--ui-rgb), 0.03)",
                  padding: "0 36px 0 12px",
                  fontSize: 13,
                  color: "var(--text-primary)",
                  outline: "none",
                  opacity: isChangingPassword ? 0.5 : 1,
                }}
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                disabled={isChangingPassword}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "var(--text-tertiary)",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label
              htmlFor="newPassword"
              style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}
            >
              New Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="newPassword"
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                disabled={isChangingPassword}
                placeholder="Enter your new password"
                style={{
                  width: "100%",
                  height: 38,
                  borderRadius: 6,
                  border: "var(--border-subtle)",
                  background: "rgba(var(--ui-rgb), 0.03)",
                  padding: "0 36px 0 12px",
                  fontSize: 13,
                  color: "var(--text-primary)",
                  outline: "none",
                  opacity: isChangingPassword ? 0.5 : 1,
                }}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                disabled={isChangingPassword}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "var(--text-tertiary)",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Password strength indicator */}
            {newPassword && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <div
                  style={{
                    flex: 1,
                    height: 4,
                    background: "rgba(var(--ui-rgb), 0.06)",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <div
                    className={`h-full transition-all duration-300 ${strengthColors[passwordStrength]} ${strengthWidth[passwordStrength]}`}
                  />
                </div>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--text-tertiary)",
                    textTransform: "capitalize",
                    minWidth: 50,
                  }}
                >
                  {passwordStrength}
                </span>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label
              htmlFor="confirmPassword"
              style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}
            >
              Confirm New Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isChangingPassword}
                placeholder="Confirm your new password"
                style={{
                  width: "100%",
                  height: 38,
                  borderRadius: 6,
                  border: "var(--border-subtle)",
                  background: "rgba(var(--ui-rgb), 0.03)",
                  padding: "0 36px 0 12px",
                  fontSize: 13,
                  color: "var(--text-primary)",
                  outline: "none",
                  opacity: isChangingPassword ? 0.5 : 1,
                }}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                disabled={isChangingPassword}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "var(--text-tertiary)",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Password Match Indicator */}
            {confirmPassword && newPassword && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 4,
                  fontSize: 12,
                }}
              >
                {confirmPassword === newPassword ? (
                  <>
                    <Check size={14} style={{ color: "#4ADE80", flexShrink: 0 }} />
                    <span style={{ color: "#4ADE80" }}>Passwords match</span>
                  </>
                ) : (
                  <>
                    <X size={14} style={{ color: "#E5534B", flexShrink: 0 }} />
                    <span style={{ color: "#E5534B" }}>Passwords don't match</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Password requirements */}
          {newPassword && (
            <div
              style={{
                padding: 14,
                borderRadius: 8,
                border: "var(--border-hairline)",
                background: "rgba(var(--ui-rgb), 0.02)",
              }}
            >
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-tertiary)",
                  margin: "0 0 10px",
                }}
              >
                Password must contain:
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {requirements.map((req, idx) => {
                  const isMet = req.test(newPassword);
                  return (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 12,
                      }}
                    >
                      {isMet ? (
                        <Check size={14} style={{ color: "#4ADE80", flexShrink: 0 }} />
                      ) : (
                        <X size={14} style={{ color: "#4B4740", flexShrink: 0 }} />
                      )}
                      <span style={{ color: isMet ? "#4ADE80" : "#4B4740" }}>{req.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ paddingTop: 8 }}>
            <button
              type="submit"
              disabled={isChangingPassword}
              className="inline-flex items-center justify-center rounded-md border border-border bg-muted px-5 py-2 text-sm font-medium text-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isChangingPassword ? "Changing Password..." : "Change Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
