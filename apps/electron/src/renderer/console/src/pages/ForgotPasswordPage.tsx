import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Button from "../components/ui/Button";
import { authService } from "../services/authService";
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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await authService.forgotPassword(email);
      setIsSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reset email");
    } finally {
      setIsLoading(false);
    }
  };

  const getInputStyle = (field: string) =>
    focusedField === field ? inputFocusStyle : inputStyle;

  if (isSuccess) {
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

          {/* Success message */}
          <div className="space-y-6 text-center">
            <div
              className="mx-auto w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: "rgba(var(--status-success-rgb), 0.15)" }}
            >
              <svg
                className="w-8 h-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                style={{ color: "var(--status-success)" }}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>

            <div className="space-y-2">
              <h1 className="text-heading-3" style={{ color: "var(--text-primary)" }}>
                Check your email
              </h1>
              <p className="text-body-sm" style={{ color: "var(--text-secondary)" }}>
                If an account exists with{" "}
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                  {email}
                </span>
                , you'll receive a password reset link shortly.
              </p>
              <p
                className="text-body-sm pt-4"
                style={{ color: "var(--text-tertiary)" }}
              >
                The link will expire in 1 hour for security reasons.
              </p>
            </div>

            <Button onClick={() => navigate("/login")} variant="secondary" className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Login
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
        {/* Logo */}
        <div className="flex justify-center">
          <AuthLogo />
        </div>

        {/* Forgot password form */}
        <div className="space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-heading-3" style={{ color: "var(--text-primary)" }}>
              Reset Your Password
            </h1>
            <p className="text-body-sm" style={{ color: "var(--text-secondary)" }}>
              Enter your email address and we'll send you a link to reset your password
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
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Email Address
              </label>
              <input
                id="email"
                type="email"
                placeholder="your@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                autoFocus
                onFocus={() => setFocusedField("email")}
                onBlur={() => setFocusedField(null)}
                className={inputClassName}
                style={getInputStyle("email")}
              />
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Sending..." : "Send Reset Link"}
            </Button>
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
              Back to Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
