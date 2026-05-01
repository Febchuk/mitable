import { FormEvent } from "react";
import { Eye, EyeOff, Check, X } from "lucide-react";

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

interface AccountTabProps {
  user: { name?: string; firstName?: string; email?: string; role?: string } | null;
  organization: { name?: string } | null;
  planLabel: string;

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

export default function AccountTab({
  user,
  organization,
  planLabel,
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
}: AccountTabProps) {
  const passwordStrength = getPasswordStrength(newPassword);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {/* Account Information Section */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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
            Account Information
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-tertiary)",
              margin: "6px 0 0",
            }}
          >
            Your profile details
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 20,
          }}
        >
          {(
            [
              { label: "Name", value: user?.name || "Not set" },
              { label: "Email", value: user?.email || "Not available" },
              {
                label: "Role",
                value: user?.role || "Employee",
                capitalize: true,
              },
              {
                label: "Organization",
                value: organization?.name || "Not available",
              },
              { label: "Plan", value: planLabel },
            ] as Array<{
              label: string;
              value: string;
              capitalize?: boolean;
              mono?: boolean;
            }>
          ).map((field) => (
            <div key={field.label}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--text-tertiary)",
                  marginBottom: 8,
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                }}
              >
                {field.label}
              </div>
              <div
                title={field.value}
                style={{
                  display: "flex",
                  alignItems: "center",
                  minHeight: 52,
                  boxSizing: "border-box",
                  padding: "14px 16px",
                  borderRadius: 10,
                  border: "0.5px solid rgba(var(--ui-rgb), 0.08)",
                  background: "var(--bg-raised)",
                  fontSize: 13,
                  lineHeight: "20px",
                  color: "var(--text-primary)",
                  fontFamily: field.mono
                    ? "var(--font-mono), ui-monospace, monospace"
                    : "var(--font-sans)",
                  textTransform: field.capitalize ? "capitalize" : undefined,
                  fontWeight: 400,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  fontVariantNumeric: field.mono ? "tabular-nums" : undefined,
                }}
              >
                {field.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Change Password Section */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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
