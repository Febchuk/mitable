import { useState, useEffect, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Check, X } from "lucide-react";
import Button from "../components/ui/Button";
import { supabase } from "../lib/supabase";
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

export default function ResetPasswordPage() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");
  const [isResetMode, setIsResetMode] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const navigate = useNavigate();

  // Password strength calculation
  const getPasswordStrength = (password: string): "weak" | "medium" | "strong" => {
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
  };

  const passwordStrength = getPasswordStrength(newPassword);
  const strengthColors: Record<string, string> = {
    weak: "var(--status-error)",
    medium: "var(--status-warning)",
    strong: "var(--status-success)",
  };
  const strengthWidths: Record<string, string> = {
    weak: "33%",
    medium: "66%",
    strong: "100%",
  };

  // Password requirements
  const requirements = [
    { label: "At least 8 characters", test: (pw: string) => pw.length >= 8 },
    { label: "Contains uppercase letter", test: (pw: string) => /[A-Z]/.test(pw) },
    { label: "Contains lowercase letter", test: (pw: string) => /[a-z]/.test(pw) },
    { label: "Contains number", test: (pw: string) => /[0-9]/.test(pw) },
  ];

  // Listen for PASSWORD_RECOVERY event from Supabase
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsResetMode(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    const failedRequirements = requirements.filter((req) => !req.test(newPassword));
    if (failedRequirements.length > 0) {
      setError("Password does not meet security requirements");
      return;
    }

    setIsLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      setIsSuccess(true);

      setTimeout(() => {
        navigate("/login");
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setIsLoading(false);
    }
  };

  const getInputStyle = (field: string) => (focusedField === field ? inputFocusStyle : inputStyle);

  const pageWrapper = (children: React.ReactNode) => (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: "var(--bg-base)" }}
    >
      <div
        className="w-full max-w-md rounded-xl p-8 space-y-6 text-center"
        style={{
          background: "var(--bg-raised)",
          border: "0.5px solid rgba(var(--ui-rgb), 0.10)",
        }}
      >
        {children}
      </div>
    </div>
  );

  if (!isResetMode) {
    return pageWrapper(
      <>
        <AuthLogo />
        <div>
          <h1 className="text-heading-3 mb-2" style={{ color: "var(--text-primary)" }}>
            Invalid Reset Link
          </h1>
          <p className="text-body-sm" style={{ color: "var(--text-secondary)" }}>
            This password reset link is invalid or has expired. Please request a new one.
          </p>
        </div>
        <Button onClick={() => navigate("/forgot-password")} className="w-full">
          Request New Link
        </Button>
      </>
    );
  }

  if (isSuccess) {
    return pageWrapper(
      <>
        <div
          className="mx-auto w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: "rgba(var(--status-success-rgb), 0.15)" }}
        >
          <Check className="w-8 h-8" style={{ color: "var(--status-success)" }} />
        </div>
        <div>
          <h1 className="text-heading-3 mb-2" style={{ color: "var(--text-primary)" }}>
            Password Reset Successful!
          </h1>
          <p className="text-body-sm" style={{ color: "var(--text-secondary)" }}>
            Redirecting you to login...
          </p>
        </div>
      </>
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
        {/* Logo */}
        <div className="flex justify-center">
          <AuthLogo />
        </div>

        {/* Reset password form */}
        <div className="space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-heading-3" style={{ color: "var(--text-primary)" }}>
              Create New Password
            </h1>
            <p className="text-body-sm" style={{ color: "var(--text-secondary)" }}>
              Choose a strong password for your account
            </p>
          </div>

          {error && (
            <div
              className="rounded-md p-3 text-sm"
              style={{
                background: "rgba(var(--status-error-rgb), 0.10)",
                border: "0.5px solid rgba(var(--status-error-rgb), 0.20)",
                color: "var(--status-error)",
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              {/* New Password */}
              <div className="space-y-2">
                <label
                  htmlFor="newPassword"
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  New Password
                </label>
                <div className="relative">
                  <input
                    id="newPassword"
                    type={showNewPassword ? "text" : "password"}
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
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    disabled={isLoading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors disabled:opacity-50"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {/* Password strength indicator */}
                {newPassword && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="flex-1 h-1 rounded-full overflow-hidden"
                        style={{ background: "var(--bg-overlay)" }}
                      >
                        <div
                          className="h-full transition-all duration-300 rounded-full"
                          style={{
                            background: strengthColors[passwordStrength],
                            width: strengthWidths[passwordStrength],
                          }}
                        />
                      </div>
                      <span
                        className="text-xs capitalize"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {passwordStrength}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <label
                  htmlFor="confirmPassword"
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    onFocus={() => setFocusedField("confirmPassword")}
                    onBlur={() => setFocusedField(null)}
                    className={`${inputClassName} pr-10`}
                    style={getInputStyle("confirmPassword")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    disabled={isLoading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors disabled:opacity-50"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Password requirements */}
              <div
                className="space-y-2 p-3 rounded-md"
                style={{
                  background: "rgba(var(--ui-rgb), 0.03)",
                  border: "0.5px solid rgba(var(--ui-rgb), 0.10)",
                }}
              >
                <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  Password must contain:
                </p>
                <div className="space-y-1">
                  {requirements.map((req, idx) => {
                    const isMet = req.test(newPassword);
                    return (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        {isMet ? (
                          <Check className="w-3 h-3" style={{ color: "var(--status-success)" }} />
                        ) : (
                          <X className="w-3 h-3" style={{ color: "var(--text-tertiary)" }} />
                        )}
                        <span
                          style={{
                            color: isMet ? "var(--status-success)" : "var(--text-tertiary)",
                          }}
                        >
                          {req.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Resetting Password..." : "Reset Password"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
