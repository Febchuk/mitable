import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, ArrowLeft, Check, X } from "lucide-react";
import Button from "../components/ui/Button";
import { useUser } from "../context/UserContext";
import AuthLogo from "../components/ui/AuthLogo";

const inputClassName =
  "flex h-10 w-full rounded-md px-3 py-2 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-50 outline-none";

const inputStyle = {
  background: "var(--bg-overlay)",
  color: "var(--text-primary)",
  border: "0.5px solid rgba(var(--ui-rgb), 0.10)",
};

const inputFocusStyle = {
  ...inputStyle,
  boxShadow: "0 0 0 2px rgba(var(--mi-accent-rgb), 0.35)",
  borderColor: "var(--mi-accent)",
};

function getPasswordStrength(password: string): "weak" | "medium" | "strong" {
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

const strengthColors = {
  weak: "var(--status-error)",
  medium: "var(--status-warning)",
  strong: "var(--status-success)",
};

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user } = useUser();

  const passwordStrength = newPassword ? getPasswordStrength(newPassword) : null;
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const passwordMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const passwordRequirements = [
    { label: "At least 8 characters", met: newPassword.length >= 8 },
    { label: "Uppercase letter", met: /[A-Z]/.test(newPassword) },
    { label: "Lowercase letter", met: /[a-z]/.test(newPassword) },
    { label: "Number", met: /[0-9]/.test(newPassword) },
  ];

  const canSubmit =
    currentPassword.length > 0 && newPassword.length >= 8 && passwordsMatch && !isLoading;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (!passwordsMatch) {
      setError("Passwords don't match");
      return;
    }

    setIsLoading(true);

    try {
      if (!window.consoleAPI?.localAuthResetPassword || !user?.email) {
        throw new Error("App not ready — please restart");
      }

      const result = await window.consoleAPI.localAuthResetPassword(
        user.email,
        currentPassword,
        newPassword
      );

      if (!result.success) {
        throw new Error(result.error || "Password change failed");
      }

      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password change failed");
    } finally {
      setIsLoading(false);
    }
  };

  const getInputStyle = (field: string) => (focusedField === field ? inputFocusStyle : inputStyle);

  if (success) {
    return (
      <div
        className="flex min-h-screen items-center justify-center p-4"
        style={{ background: "var(--bg-base)" }}
      >
        <div
          className="w-full max-w-md rounded-xl p-8 space-y-8"
          style={{
            background: "var(--bg-raised)",
            border: "0.5px solid rgba(var(--ui-rgb), 0.10)",
          }}
        >
          <div className="flex justify-center">
            <AuthLogo />
          </div>
          <div className="space-y-6 text-center">
            <div
              className="mx-auto w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: "rgba(58, 155, 107, 0.15)" }}
            >
              <Check className="w-8 h-8" style={{ color: "var(--status-success)" }} />
            </div>
            <div className="space-y-2">
              <h1 className="text-heading-3" style={{ color: "var(--text-primary)" }}>
                Password changed
              </h1>
              <p className="text-body-sm" style={{ color: "var(--text-secondary)" }}>
                Your password has been updated successfully.
              </p>
            </div>
            <Button onClick={() => navigate("/profile")} variant="secondary" className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to settings
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: "var(--bg-base)" }}
    >
      <div
        className="w-full max-w-md rounded-xl p-8 space-y-8"
        style={{
          background: "var(--bg-raised)",
          border: "0.5px solid rgba(var(--ui-rgb), 0.10)",
        }}
      >
        <div className="flex justify-center">
          <AuthLogo />
        </div>

        <div className="space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-heading-3" style={{ color: "var(--text-primary)" }}>
              Change password
            </h1>
            <p className="text-body-sm" style={{ color: "var(--text-secondary)" }}>
              Enter your current password and choose a new one
            </p>
          </div>

          {error && (
            <div
              className="rounded-md p-3 text-sm"
              style={{
                background: "rgba(232, 116, 116, 0.10)",
                border: "0.5px solid rgba(232, 116, 116, 0.20)",
                color: "var(--status-error)",
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="currentPassword"
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Current password
              </label>
              <div className="relative">
                <input
                  id="currentPassword"
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  autoFocus
                  onFocus={() => setFocusedField("currentPassword")}
                  onBlur={() => setFocusedField(null)}
                  className={`${inputClassName} pr-10`}
                  style={getInputStyle("currentPassword")}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  disabled={isLoading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors disabled:opacity-50"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="pt-2" style={{ borderTop: "0.5px solid rgba(var(--ui-rgb), 0.08)" }} />

            <div className="space-y-2">
              <label
                htmlFor="newPassword"
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                New password
              </label>
              <div className="relative">
                <input
                  id="newPassword"
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  onFocus={() => setFocusedField("newPassword")}
                  onBlur={() => setFocusedField(null)}
                  className={`${inputClassName} pr-10`}
                  style={getInputStyle("newPassword")}
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  disabled={isLoading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors disabled:opacity-50"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {newPassword && (
                <div className="space-y-2 pt-1">
                  <div className="flex gap-1">
                    {(["weak", "medium", "strong"] as const).map((level) => (
                      <div
                        key={level}
                        className="h-1 flex-1 rounded-full transition-colors"
                        style={{
                          background:
                            passwordStrength &&
                            (["weak", "medium", "strong"] as const).indexOf(passwordStrength) >=
                              (["weak", "medium", "strong"] as const).indexOf(level)
                              ? strengthColors[passwordStrength]
                              : "rgba(var(--ui-rgb), 0.10)",
                        }}
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {passwordRequirements.map((req) => (
                      <span
                        key={req.label}
                        className="text-xs flex items-center gap-1"
                        style={{
                          color: req.met ? "var(--status-success)" : "var(--text-tertiary)",
                        }}
                      >
                        {req.met ? <Check size={12} /> : <X size={12} />}
                        {req.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label
                htmlFor="confirmPassword"
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Confirm new password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  onFocus={() => setFocusedField("confirmPassword")}
                  onBlur={() => setFocusedField(null)}
                  className={`${inputClassName} pr-10`}
                  style={{
                    ...getInputStyle("confirmPassword"),
                    ...(passwordMismatch
                      ? { borderColor: "var(--status-error)" }
                      : passwordsMatch
                        ? { borderColor: "var(--status-success)" }
                        : {}),
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  disabled={isLoading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors disabled:opacity-50"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {passwordMismatch && (
                <p className="text-xs" style={{ color: "var(--status-error)" }}>
                  Passwords don't match
                </p>
              )}
            </div>

            <div className="pt-2">
              <Button type="submit" className="w-full" disabled={!canSubmit}>
                {isLoading ? "Changing password..." : "Change password"}
              </Button>
            </div>
          </form>

          <div
            className="text-center pt-2"
            style={{ borderTop: "0.5px solid rgba(var(--ui-rgb), 0.10)" }}
          >
            <button
              onClick={() => navigate("/profile")}
              className="text-sm transition-colors inline-flex items-center"
              style={{ color: "var(--text-tertiary)" }}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
