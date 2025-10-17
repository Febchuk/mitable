import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import Button from "../components/ui/Button";
import { authService } from "../services/authService";
import { useUser } from "../context/UserContext";
import logoSvg from "../../../assets/logo.svg";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { updateUser } = useUser();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await authService.login({ email, password });

      // Save tokens
      authService.saveTokens(response.session.access_token, response.session.refresh_token);

      // Update user context
      updateUser({
        name: `${response.profile.firstName || ""} ${response.profile.lastName || ""}`.trim(),
        firstName: response.profile.firstName || "",
        avatarUrl: response.profile.avatarUrl || undefined,
        currentWeek: response.profile.currentWeek || 1,
        role: response.profile.role,
      });

      // Redirect based on role
      if (response.profile.role === "admin") {
        navigate("/dashboard");
      } else {
        navigate("/home");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#1A1A1A] p-4">
      <div className="w-full max-w-md bg-background-secondary rounded-lg border border-border-subtle p-8 space-y-8">
        {/* Logo */}
        <div className="flex justify-center">
          <img src={logoSvg} alt="Mitable" className="h-14 w-auto" />
        </div>

        {/* Login form */}
        <div className="space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-heading-3 text-white">Welcome</h1>
            <p className="text-body-sm text-text-secondary">
              Sign in to continue your onboarding journey
            </p>
          </div>

          {error && (
            <div className="rounded-md bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-text-primary">
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
                  className="flex h-10 w-full rounded-md border border-border-subtle bg-background-elevated px-3 py-2 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-text-primary">
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
                <div className="flex justify-end">
                  <a
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    className="text-xs text-primary-light hover:text-primary-hover transition-colors"
                  >
                    Forgot password?
                  </a>
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          <p className="text-center text-sm text-text-tertiary">
            Questions? Your AI assistant is here to help
          </p>

          <div className="text-center pt-2 border-t border-border-subtle">
            <p className="text-sm text-text-tertiary">
              Setting up Mitable?{" "}
              <a
                href="#/signup-organization"
                className="text-primary-light hover:text-primary-hover transition-colors font-medium"
              >
                Create Organization →
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
