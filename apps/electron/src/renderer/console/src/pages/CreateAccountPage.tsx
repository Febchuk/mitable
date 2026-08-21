import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, ArrowLeft, Check, X } from "lucide-react";
import Button from "../components/ui/Button";
import { authService } from "../services/authService";
import { useUser } from "../context/UserContext";
import { trackEvent } from "@/lib/posthog";
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

export default function CreateAccountPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const navigate = useNavigate();
  const { updateUser } = useUser();

  const passwordStrength = password ? getPasswordStrength(password) : null;
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  const passwordRequirements = [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "Uppercase letter", met: /[A-Z]/.test(password) },
    { label: "Lowercase letter", met: /[a-z]/.test(password) },
    { label: "Number", met: /[0-9]/.test(password) },
  ];

  const canSubmit =
    firstName.trim() && email.trim() && password.length >= 8 && passwordsMatch && !isLoading;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!passwordsMatch) {
      setError("Passwords don't match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setIsLoading(true);

    try {
      if (!window.consoleAPI?.localAuthCreate) {
        throw new Error("App not ready — please restart");
      }

      const result = await window.consoleAPI.localAuthCreate({
        email: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });

      if (!result.success) {
        throw new Error(result.error || "Account creation failed");
      }

      authService.clearTokens();

      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      updateUser({
        id: result.userId!,
        name: fullName || email,
        firstName: firstName.trim(),
        email: email.trim(),
        currentWeek: 1,
        role: "employee",
        organizationId: "local",
        isLocalAccount: true,
      });

      trackEvent("console_account_created", { auth: "local" });

      navigate("/setup");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Account creation failed");
    } finally {
      setIsLoading(false);
    }
  };

  const getInputStyle = (field: string) => (focusedField === field ? inputFocusStyle : inputStyle);

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
              Create your account
            </h1>
            <p className="text-body-sm" style={{ color: "var(--text-secondary)" }}>
              Everything stays on your device
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
            <div className="flex gap-3">
              <div className="flex-1 space-y-2">
                <label
                  htmlFor="firstName"
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  First name
                </label>
                <input
                  id="firstName"
                  type="text"
                  placeholder="Alex"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  disabled={isLoading}
                  autoFocus
                  onFocus={() => setFocusedField("firstName")}
                  onBlur={() => setFocusedField(null)}
                  className={inputClassName}
                  style={getInputStyle("firstName")}
                />
              </div>
              <div className="flex-1 space-y-2">
                <label
                  htmlFor="lastName"
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  Last name
                </label>
                <input
                  id="lastName"
                  type="text"
                  placeholder="Zhang"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={isLoading}
                  onFocus={() => setFocusedField("lastName")}
                  onBlur={() => setFocusedField(null)}
                  className={inputClassName}
                  style={getInputStyle("lastName")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="email"
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                onFocus={() => setFocusedField("email")}
                onBlur={() => setFocusedField(null)}
                className={inputClassName}
                style={getInputStyle("email")}
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="password"
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                  className={`${inputClassName} pr-10`}
                  style={getInputStyle("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors disabled:opacity-50"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {password && (
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
                Confirm password
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
                {isLoading ? "Creating account..." : "Create account"}
              </Button>
            </div>
          </form>

          <div
            className="text-center pt-2"
            style={{ borderTop: "0.5px solid rgba(var(--ui-rgb), 0.10)" }}
          >
            <button
              onClick={() => navigate("/login")}
              className="text-sm transition-colors inline-flex items-center"
              style={{ color: "var(--text-tertiary)" }}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to sign in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
