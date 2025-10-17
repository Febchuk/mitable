import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import Button from "../components/ui/Button";
import { authService } from "../services/authService";
import { useUser } from "../context/UserContext";
import logoSvg from "../../../assets/logo.svg";

export default function SignupOrganizationPage() {
  const [formData, setFormData] = useState({
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
  const navigate = useNavigate();
  const { updateUser } = useUser();

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await authService.signupOrganization({
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
        organizationName: formData.organizationName,
        organizationDomain: formData.organizationDomain || undefined,
      });

      // Save tokens
      authService.saveTokens(response.session.access_token, response.session.refresh_token);

      // Update user context
      updateUser({
        id: response.profile.id,
        name: `${response.profile.firstName || ""} ${response.profile.lastName || ""}`.trim(),
        firstName: response.profile.firstName || "",
        avatarUrl: response.profile.avatarUrl || undefined,
        currentWeek: response.profile.currentWeek || 1,
        role: response.profile.role,
      });

      // Redirect to admin dashboard
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#1A1A1A] p-4">
      <div className="w-full max-w-md bg-background-secondary rounded-lg border border-border-subtle p-8 space-y-6">
        {/* Logo */}
        <div className="flex justify-center">
          <img src={logoSvg} alt="Mitable" className="h-14 w-auto" />
        </div>

        {/* Signup form */}
        <div className="space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-heading-3 text-white">Create Your Organization</h1>
            <p className="text-body-sm text-text-secondary">
              Set up your organization and admin account
            </p>
          </div>

          {error && (
            <div className="rounded-md bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name fields in a row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label htmlFor="firstName" className="text-sm font-medium text-text-primary">
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
                  className="flex h-10 w-full rounded-md border border-border-subtle bg-background-elevated px-3 py-2 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="lastName" className="text-sm font-medium text-text-primary">
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
                  className="flex h-10 w-full rounded-md border border-border-subtle bg-background-elevated px-3 py-2 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-all"
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-text-primary">
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
                className="flex h-10 w-full rounded-md border border-border-subtle bg-background-elevated px-3 py-2 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-all"
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-text-primary">
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
                  className="flex h-10 w-full rounded-md border border-border-subtle bg-background-elevated px-3 py-2 pr-10 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-50"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Organization Name */}
            <div className="space-y-2">
              <label htmlFor="organizationName" className="text-sm font-medium text-text-primary">
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
                className="flex h-10 w-full rounded-md border border-border-subtle bg-background-elevated px-3 py-2 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-all"
              />
            </div>

            {/* Organization Domain (optional) */}
            <div className="space-y-2">
              <label htmlFor="organizationDomain" className="text-sm font-medium text-text-primary">
                Organization Domain{" "}
                <span className="text-text-tertiary font-normal">(optional)</span>
              </label>
              <input
                id="organizationDomain"
                type="text"
                placeholder="acme.com"
                value={formData.organizationDomain}
                onChange={(e) => handleChange("organizationDomain", e.target.value)}
                disabled={isLoading}
                className="flex h-10 w-full rounded-md border border-border-subtle bg-background-elevated px-3 py-2 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-all"
              />
              <p className="text-xs text-text-tertiary">
                Auto-join employees with matching email domain
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Creating organization..." : "Create Organization"}
            </Button>
          </form>

          <div className="text-center pt-2 border-t border-border-subtle">
            <p className="text-sm text-text-tertiary">
              Already have an account?{" "}
              <a
                href="#/login"
                className="text-primary-light hover:text-primary-hover transition-colors font-medium"
              >
                Sign in
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
