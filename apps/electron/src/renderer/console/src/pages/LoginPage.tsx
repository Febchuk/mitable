import { useState, useEffect, useRef, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, User, ChevronRight } from "lucide-react";
import Button from "../components/ui/Button";
import { authService } from "../services/authService";
import { useUser } from "../context/UserContext";
import { useUpdate } from "../context/UpdateContext";
import { trackEvent } from "@/lib/posthog";
import AuthLogo from "../components/ui/AuthLogo";
import HelpFeedbackButton from "../components/ui/HelpFeedbackButton";

const inputClassName =
  "flex h-10 w-full rounded-md px-3 py-2 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-50 outline-none";

const inputStyle: React.CSSProperties = {
  background: "var(--bg-overlay)",
  color: "var(--text-primary)",
  borderWidth: "0.5px",
  borderStyle: "solid",
  borderColor: "rgba(var(--ui-rgb), 0.10)",
};

const inputFocusStyle: React.CSSProperties = {
  ...inputStyle,
  boxShadow: "0 0 0 2px rgba(var(--mi-accent-rgb), 0.35)",
  borderColor: "var(--mi-accent)",
};

interface SavedAccount {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<SavedAccount | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { updateUser } = useUser();
  const { updateState, updateInfo, installUpdate } = useUpdate();

  useEffect(() => {
    window.consoleAPI?.localAuthListAccounts?.().then((accounts) => {
      setSavedAccounts(accounts ?? []);
    });
  }, []);

  const selectAccount = (account: SavedAccount) => {
    setSelectedAccount(account);
    setEmail(account.email);
    setPassword("");
    setError("");
    setTimeout(() => passwordRef.current?.focus(), 50);
  };

  const clearSelection = () => {
    setSelectedAccount(null);
    setEmail("");
    setPassword("");
    setError("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      if (!window.consoleAPI?.localAuthLogin) {
        throw new Error("App not ready — please restart");
      }

      const result = await window.consoleAPI.localAuthLogin(email, password);

      if (!result.success) {
        throw new Error(result.error || "Login failed");
      }

      authService.clearTokens();

      const fullName = `${result.firstName || ""} ${result.lastName || ""}`.trim();
      updateUser({
        id: result.userId!,
        name: fullName || email,
        firstName: result.firstName || "",
        email,
        currentWeek: 1,
        role: "employee",
        organizationId: "local",
        isLocalAccount: true,
      });

      trackEvent("console_login_completed", { auth: "local" });

      navigate("/setup");
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
        <div className="flex justify-center">
          <AuthLogo />
        </div>

        <div className="space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-heading-3" style={{ color: "var(--text-primary)" }}>
              Welcome back
            </h1>
            <p className="text-body-sm" style={{ color: "var(--text-secondary)" }}>
              {selectedAccount
                ? `Signing in as ${selectedAccount.firstName || selectedAccount.email}`
                : savedAccounts.length > 0
                  ? "Choose an account"
                  : "Sign in to your account"}
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

          {/* Account picker — shown when accounts exist and none is selected yet */}
          {savedAccounts.length > 0 && !selectedAccount && (
            <div className="space-y-2">
              {savedAccounts.map((account) => {
                const initials = [account.firstName, account.lastName]
                  .filter(Boolean)
                  .map((n) => n[0]?.toUpperCase())
                  .join("");
                const displayName = [account.firstName, account.lastName].filter(Boolean).join(" ");

                return (
                  <button
                    key={account.id}
                    onClick={() => selectAccount(account)}
                    className="w-full flex items-center gap-3 rounded-lg px-3 py-3 text-left transition-all"
                    style={{
                      background: "var(--bg-overlay)",
                      border: "0.5px solid rgba(var(--ui-rgb), 0.10)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--bg-muted)";
                      e.currentTarget.style.borderColor = "rgba(var(--mi-accent-rgb), 0.35)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "var(--bg-overlay)";
                      e.currentTarget.style.borderColor = "rgba(var(--ui-rgb), 0.10)";
                    }}
                  >
                    <div
                      className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium"
                      style={{
                        background: "rgba(var(--mi-accent-rgb), 0.15)",
                        color: "var(--mi-accent)",
                      }}
                    >
                      {initials || <User size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      {displayName && (
                        <p
                          className="text-sm font-medium truncate"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {displayName}
                        </p>
                      )}
                      <p
                        className="text-xs truncate"
                        style={{
                          color: displayName ? "var(--text-secondary)" : "var(--text-primary)",
                        }}
                      >
                        {account.email}
                      </p>
                    </div>
                    <ChevronRight
                      size={16}
                      style={{ color: "var(--text-tertiary)", flexShrink: 0 }}
                    />
                  </button>
                );
              })}

              <button
                onClick={() => {
                  setSelectedAccount(null);
                  setSavedAccounts([]);
                }}
                className="w-full text-center text-sm py-2 transition-colors"
                style={{ color: "var(--text-tertiary)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--mi-accent)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-tertiary)")}
              >
                Use a different email
              </button>
            </div>
          )}

          {/* Login form — shown when no saved accounts OR an account is selected */}
          {(savedAccounts.length === 0 || selectedAccount) && (
            <>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                  {selectedAccount ? (
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all"
                      style={{
                        background: "rgba(var(--mi-accent-rgb), 0.08)",
                        border: "0.5px solid rgba(var(--mi-accent-rgb), 0.25)",
                      }}
                    >
                      <div
                        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium"
                        style={{
                          background: "rgba(var(--mi-accent-rgb), 0.15)",
                          color: "var(--mi-accent)",
                        }}
                      >
                        {[selectedAccount.firstName, selectedAccount.lastName]
                          .filter(Boolean)
                          .map((n) => n[0]?.toUpperCase())
                          .join("") || <User size={14} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate" style={{ color: "var(--text-primary)" }}>
                          {selectedAccount.email}
                        </p>
                      </div>
                      <span className="text-xs" style={{ color: "var(--mi-accent)" }}>
                        Change
                      </span>
                    </button>
                  ) : (
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
                  )}
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
                        ref={passwordRef}
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
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            </>
          )}

          <div
            className="text-center pt-2"
            style={{ borderTop: "0.5px solid rgba(var(--ui-rgb), 0.10)" }}
          >
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              New here?{" "}
              <a
                href="#/create-account"
                className="font-medium transition-colors"
                style={{ color: "var(--mi-accent)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--mi-accent-light)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--mi-accent)")}
              >
                Create an account
              </a>
            </p>
          </div>
        </div>
      </div>

      <HelpFeedbackButton anonymousSource="login" />
    </div>
  );
}
