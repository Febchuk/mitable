import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Button from "../components/ui/Button";
import { authService } from "../services/authService";
import logoSvg from "../../../assets/logo.svg";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");
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

  if (isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background-primary via-[#1e1b4b] to-background-primary p-4 relative overflow-hidden">
        {/* Animated gradient orbs */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl animate-pulse delay-1000"></div>

        <div className="w-full max-w-md bg-background-secondary/80 backdrop-blur-xl rounded-2xl border border-border-subtle shadow-card-hover p-8 space-y-8 relative z-10">
          {/* Logo */}
          <div className="flex justify-center">
            <img src={logoSvg} alt="Mitable" className="h-14 w-auto" />
          </div>

          {/* Success message */}
          <div className="space-y-6 text-center">
            <div className="mx-auto w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-green-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
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
              <h1 className="text-heading-3 text-white">Check your email</h1>
              <p className="text-body-sm text-text-secondary">
                If an account exists with <span className="text-white font-medium">{email}</span>,
                you'll receive a password reset link shortly.
              </p>
              <p className="text-body-sm text-text-tertiary pt-4">
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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background-primary via-[#1e1b4b] to-background-primary p-4 relative overflow-hidden">
      {/* Animated gradient orbs */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl animate-pulse delay-1000"></div>

      <div className="w-full max-w-md bg-background-secondary/80 backdrop-blur-xl rounded-2xl border border-border-subtle shadow-card-hover p-8 space-y-8 relative z-10">
        {/* Logo */}
        <div className="flex justify-center">
          <img src={logoSvg} alt="Mitable" className="h-14 w-auto" />
        </div>

        {/* Forgot password form */}
        <div className="space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-heading-3 text-white">Reset Your Password</h1>
            <p className="text-body-sm text-text-secondary">
              Enter your email address and we'll send you a link to reset your password
            </p>
          </div>

          {error && (
            <div className="rounded-md bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-text-primary">
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
                className="flex h-10 w-full rounded-md border border-border-subtle bg-background-elevated px-3 py-2 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-transparent focus:shadow-glow-purple disabled:cursor-not-allowed disabled:opacity-50 transition-all"
              />
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Sending..." : "Send Reset Link"}
            </Button>
          </form>

          <div className="text-center pt-2 border-t border-border-subtle">
            <button
              onClick={() => navigate("/login")}
              className="text-sm text-text-tertiary hover:text-text-primary transition-colors inline-flex items-center"
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
