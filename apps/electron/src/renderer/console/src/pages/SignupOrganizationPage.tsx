import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import Button from "../components/ui/Button";
import { authService } from "../services/authService";
import { useUser } from "../context/UserContext";
import AuthLogo from "../components/ui/AuthLogo";
import HelpFeedbackButton from "../components/ui/HelpFeedbackButton";
import type { AccountType } from "@mitable/shared";

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

export default function SignupOrganizationPage() {
  const [formData, setFormData] = useState({
    accountType: "personal" as AccountType,
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    organizationName: "",
    organizationDomain: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const navigate = useNavigate();
  const { updateUser } = useUser();

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleAccountTypeChange = (type: AccountType) => {
    setFormData((prev) => ({
      ...prev,
      accountType: type,
      organizationName: type === "personal" ? "" : prev.organizationName,
      organizationDomain: type === "personal" ? "" : prev.organizationDomain,
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await authService.signupOrganization({
        accountType: formData.accountType,
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
        organizationName: formData.accountType === "team" ? formData.organizationName : undefined,
        organizationDomain:
          formData.accountType === "team" && formData.organizationDomain
            ? formData.organizationDomain
            : undefined,
      });

      authService.saveTokens(response.session.access_token, response.session.refresh_token);

      updateUser({
        id: response.profile.id,
        name: `${response.profile.firstName || ""} ${response.profile.lastName || ""}`.trim(),
        firstName: response.profile.firstName || "",
        avatarUrl: response.profile.avatarUrl || undefined,
        currentWeek: response.profile.currentWeek || 1,
        role: response.profile.role,
        organizationId: response.profile.organizationId || "",
      });

      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
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
        className="w-full max-w-md rounded-xl p-8 space-y-6"
        style={{
          background: "var(--bg-raised)",
          border: "0.5px solid rgba(var(--ui-rgb), 0.10)",
        }}
      >
        {/* Logo */}
        <div className="flex justify-center">
          <AuthLogo />
        </div>

        {/* Signup form */}
        <div className="space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-heading-3" style={{ color: "var(--text-primary)" }}>
              {formData.accountType === "personal"
                ? "Create Your Account"
                : "Create Your Organization"}
            </h1>
            <p className="text-body-sm" style={{ color: "var(--text-secondary)" }}>
              {formData.accountType === "personal"
                ? "Set up your personal Mitable account"
                : "Set up your organization and admin account"}
            </p>
          </div>

          {/* Account Type Toggle */}
          <div className="flex justify-center">
            <div
              className="inline-flex rounded-lg p-1"
              style={{
                background: "var(--bg-overlay)",
                border: "0.5px solid rgba(var(--ui-rgb), 0.10)",
              }}
            >
              <button
                type="button"
                onClick={() => handleAccountTypeChange("personal")}
                className="px-4 py-2 text-sm font-medium rounded-md transition-all"
                style={
                  formData.accountType === "personal"
                    ? { background: "var(--mi-accent-bg)", color: "var(--mi-accent)" }
                    : { color: "var(--text-secondary)" }
                }
              >
                Personal
              </button>
              <button
                type="button"
                onClick={() => handleAccountTypeChange("team")}
                className="px-4 py-2 text-sm font-medium rounded-md transition-all"
                style={
                  formData.accountType === "team"
                    ? { background: "var(--mi-accent-bg)", color: "var(--mi-accent)" }
                    : { color: "var(--text-secondary)" }
                }
              >
                Team
              </button>
            </div>
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

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name fields in a row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label
                  htmlFor="firstName"
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  First Name
                </label>
                <input
                  id="firstName"
                  type="text"
                  placeholder="Jane"
                  value={formData.firstName}
                  onChange={(e) => handleChange("firstName", e.target.value)}
                  required
                  disabled={isLoading}
                  onFocus={() => setFocusedField("firstName")}
                  onBlur={() => setFocusedField(null)}
                  className={inputClassName}
                  style={getInputStyle("firstName")}
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="lastName"
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  Last Name
                </label>
                <input
                  id="lastName"
                  type="text"
                  placeholder="Smith"
                  value={formData.lastName}
                  onChange={(e) => handleChange("lastName", e.target.value)}
                  required
                  disabled={isLoading}
                  onFocus={() => setFocusedField("lastName")}
                  onBlur={() => setFocusedField(null)}
                  className={inputClassName}
                  style={getInputStyle("lastName")}
                />
              </div>
            </div>

            {/* Email */}
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
                placeholder="admin@company.com"
                value={formData.email}
                onChange={(e) => handleChange("email", e.target.value)}
                required
                disabled={isLoading}
                onFocus={() => setFocusedField("email")}
                onBlur={() => setFocusedField(null)}
                className={inputClassName}
                style={getInputStyle("email")}
              />
            </div>

            {/* Password */}
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
                  value={formData.password}
                  onChange={(e) => handleChange("password", e.target.value)}
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

            {/* Organization Fields - Only shown for Team accounts */}
            {formData.accountType === "team" && (
              <>
                <div className="space-y-2">
                  <label
                    htmlFor="organizationName"
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Organization Name
                  </label>
                  <input
                    id="organizationName"
                    type="text"
                    placeholder="Acme Corp"
                    value={formData.organizationName}
                    onChange={(e) => handleChange("organizationName", e.target.value)}
                    required
                    disabled={isLoading}
                    onFocus={() => setFocusedField("organizationName")}
                    onBlur={() => setFocusedField(null)}
                    className={inputClassName}
                    style={getInputStyle("organizationName")}
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="organizationDomain"
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Organization Domain{" "}
                    <span style={{ color: "var(--text-tertiary)" }} className="font-normal">
                      (optional)
                    </span>
                  </label>
                  <input
                    id="organizationDomain"
                    type="text"
                    placeholder="acme.com"
                    value={formData.organizationDomain}
                    onChange={(e) => handleChange("organizationDomain", e.target.value)}
                    disabled={isLoading}
                    onFocus={() => setFocusedField("organizationDomain")}
                    onBlur={() => setFocusedField(null)}
                    className={inputClassName}
                    style={getInputStyle("organizationDomain")}
                  />
                  <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    Auto-join employees with matching email domain
                  </p>
                </div>
              </>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading
                ? formData.accountType === "personal"
                  ? "Creating account..."
                  : "Creating organization..."
                : formData.accountType === "personal"
                  ? "Create Account"
                  : "Create Organization"}
            </Button>
          </form>

          <div
            className="text-center pt-2"
            style={{ borderTop: "0.5px solid rgba(var(--ui-rgb), 0.10)" }}
          >
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              Already have an account?{" "}
              <a
                href="#/login"
                className="font-medium transition-colors"
                style={{ color: "var(--mi-accent)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--mi-accent-light)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--mi-accent)")}
              >
                Sign in
              </a>
            </p>
          </div>
        </div>
      </div>

      <HelpFeedbackButton anonymousSource="register" />
    </div>
  );
}
