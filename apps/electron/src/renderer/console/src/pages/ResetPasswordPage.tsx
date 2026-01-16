import { useState, useEffect, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Check, X } from "lucide-react";
import Button from "../components/ui/Button";
import { supabase } from "../lib/supabase";
import logoSvg from "../../../assets/logo.svg";

export default function ResetPasswordPage() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");
  const [isResetMode, setIsResetMode] = useState(false);
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
  const strengthColors = {
    weak: "bg-red-500",
    medium: "bg-yellow-500",
    strong: "bg-green-500",
  };
  const strengthWidth = {
    weak: "w-1/3",
    medium: "w-2/3",
    strong: "w-full",
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

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    // Validate password strength
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

      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate("/login");
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isResetMode) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background-primary via-[#1e1b4b] to-background-primary p-4">
        <div className="w-full max-w-md bg-background-secondary/80 backdrop-blur-xl rounded-2xl border border-border-subtle shadow-card-hover p-8 space-y-6 text-center">
          <img src={logoSvg} alt="Mitable" className="h-14 w-auto mx-auto" />
          <div>
            <h1 className="text-heading-3 text-white mb-2">Invalid Reset Link</h1>
            <p className="text-body-sm text-text-secondary">
              This password reset link is invalid or has expired. Please request a new one.
            </p>
          </div>
          <Button onClick={() => navigate("/forgot-password")} className="w-full">
            Request New Link
          </Button>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background-primary via-[#1e1b4b] to-background-primary p-4">
        <div className="w-full max-w-md bg-background-secondary/80 backdrop-blur-xl rounded-2xl border border-border-subtle shadow-card-hover p-8 space-y-6 text-center">
          <div className="mx-auto w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
            <Check className="w-8 h-8 text-green-400" />
          </div>
          <div>
            <h1 className="text-heading-3 text-white mb-2">Password Reset Successful!</h1>
            <p className="text-body-sm text-text-secondary">Redirecting you to login...</p>
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

        {/* Reset password form */}
        <div className="space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-heading-3 text-white">Create New Password</h1>
            <p className="text-body-sm text-text-secondary">
              Choose a strong password for your account
            </p>
          </div>

          {error && (
            <div className="rounded-md bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              {/* New Password */}
              <div className="space-y-2">
                <label htmlFor="newPassword" className="text-sm font-medium text-text-primary">
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
                    className="flex h-10 w-full rounded-md border border-border-subtle bg-background-elevated px-3 py-2 pr-10 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    disabled={isLoading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-50"
                  >
                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {/* Password strength indicator */}
                {newPassword && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 bg-background-elevated rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${strengthColors[passwordStrength]} ${strengthWidth[passwordStrength]}`}
                        />
                      </div>
                      <span className="text-xs text-text-secondary capitalize">{passwordStrength}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="text-sm font-medium text-text-primary">
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
                    className="flex h-10 w-full rounded-md border border-border-subtle bg-background-elevated px-3 py-2 pr-10 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    disabled={isLoading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-50"
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Password requirements */}
              <div className="space-y-2 p-3 bg-background-elevated/50 rounded-md border border-border-subtle">
                <p className="text-xs font-medium text-text-secondary">Password must contain:</p>
                <div className="space-y-1">
                  {requirements.map((req, idx) => {
                    const isMet = req.test(newPassword);
                    return (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        {isMet ? (
                          <Check className="w-3 h-3 text-green-400" />
                        ) : (
                          <X className="w-3 h-3 text-text-tertiary" />
                        )}
                        <span className={isMet ? "text-green-400" : "text-text-tertiary"}>
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
