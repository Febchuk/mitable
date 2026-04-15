import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import Button from "../components/ui/Button";
import { authService } from "../services/authService";
import { useUser } from "../context/UserContext";
import { useUpdate } from "../context/UpdateContext";
import { trackEvent } from "@/lib/posthog";
import AuthLogo from "../components/ui/AuthLogo";
import HelpFeedbackButton from "../components/ui/HelpFeedbackButton";

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

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const navigate = useNavigate();
  const { updateUser } = useUser();
  const { updateState, updateInfo, installUpdate } = useUpdate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await authService.login({ email, password });

      // Main process must receive USER_CONTEXT_SET before AUTH_SET_TOKENS so
      // setTokens can persist the refresh token to the OS keychain (otherwise
      // the next launch restores a stale token → refresh_token_not_found).
      const profile = response.profile as Record<string, any>;
      updateUser({
        id: profile.id,
        name: `${profile.firstName || ""} ${profile.lastName || ""}`.trim(),
        firstName: profile.firstName || "",
        avatarUrl: profile.avatarUrl || undefined,
        currentWeek: profile.currentWeek || 1,
        role: profile.role,
        organizationId: profile.organizationId || "",
        isManager: profile.isManager ?? false,
        managerId: profile.managerId ?? null,
        teamId: profile.teamId ?? null,
        department: profile.department ?? null,
        directReportCount: profile.directReportCount ?? 0,
      });

      authService.saveTokens(response.session.access_token, response.session.refresh_token);

      trackEvent("console_login_completed");

      // Redirect to default route (handles onboarding check)
      navigate("/");
    } catch (err) {
      trackEvent("console_login_failed", {
        error_message: err instanceof Error ? err.message : "Unknown",
      });
      setError(err instanceof Error ? err.message : "Login failed");
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
      {updateState === "downloaded" && (
        <div
          className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-2 text-sm"
          style={{
            background: "rgba(var(--mi-accent-rgb), 0.12)",
            borderBottom: "1px solid rgba(var(--mi-accent-rgb), 0.25)",
          }}
        >
          <span style={{ color: "var(--text-primary)" }}>
            v{updateInfo?.version} is ready — restart to apply
          </span>
          <button
            onClick={installUpdate}
            className="px-3 py-1 rounded-md text-xs font-medium transition-colors"
            style={{ background: "var(--mi-accent)", color: "var(--bg-base)" }}
          >
            Install &amp; Restart
          </button>
        </div>
      )}
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

        {/* Login form */}
        <div className="space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-heading-3" style={{ color: "var(--text-primary)" }}>
              Welcome
            </h1>
            <p className="text-body-sm" style={{ color: "var(--text-secondary)" }}>
              Sign in to your workspace
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
                  placeholder="your@company.com"
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
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => navigate("/forgot-password")}
                    className="text-xs transition-colors"
                    style={{ color: "var(--mi-accent)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--mi-accent-light)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--mi-accent)")}
                  >
                    Forgot password?
                  </button>
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          <p className="text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
            Questions? Your AI assistant is here to help
          </p>

          <div
            className="text-center pt-2"
            style={{ borderTop: "0.5px solid rgba(var(--ui-rgb), 0.10)" }}
          >
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              New to Mitable?{" "}
              <a
                href="#/signup-organization"
                className="font-medium transition-colors"
                style={{ color: "var(--mi-accent)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--mi-accent-light)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--mi-accent)")}
              >
                Sign up now &rarr;
              </a>
            </p>
          </div>
        </div>
      </div>

      <HelpFeedbackButton anonymousSource="login" />
    </div>
  );
}
