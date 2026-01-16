import { useState, FormEvent, useEffect } from "react";
import {
  Eye,
  EyeOff,
  Check,
  X,
  Lock,
  User,
  Loader2,
  Link2,
  Unlink,
  Mail,
  RefreshCw,
  ExternalLink,
  Info,
  Download,
} from "lucide-react";
import { SiLinear, SiGmail } from "react-icons/si";
import Button from "../components/ui/Button";
import { Button as ShadcnButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { authService } from "../services/authService";
import { useUser } from "../context/UserContext";
import { useToast } from "@/hooks/use-toast";
import { BillingSection } from "@/console/src/components/billing";
import { createLogger } from "../../../lib/logger";

const logger = createLogger("UserProfilePage");
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface LinearStatus {
  connected: boolean;
  expired: boolean;
}

interface GmailStatus {
  connected: boolean;
  expired: boolean;
  email: string | null;
}

export default function UserProfilePage() {
  const { user } = useUser();
  const { toast } = useToast();

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Integrations state
  const [linearStatus, setLinearStatus] = useState<LinearStatus | null>(null);
  const [isLinearLoading, setIsLinearLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
  const [isGmailLoading, setIsGmailLoading] = useState(true);
  const [isGmailConnecting, setIsGmailConnecting] = useState(false);
  const [isGmailDisconnecting, setIsGmailDisconnecting] = useState(false);

  // About / Version state
  const [appVersion, setAppVersion] = useState<string>("");
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<
    "idle" | "checking" | "up-to-date" | "available" | "downloading" | "downloaded" | "error"
  >("idle");
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{
    percent: number;
    transferred: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    loadLinearStatus();
    loadGmailStatus();
    loadAppVersion();
  }, []);

  // Listen for update events
  useEffect(() => {
    const unsubscribeAvailable = window.consoleAPI?.onUpdateAvailable((info) => {
      logger.info("Update available:", info.version);
      setIsCheckingForUpdates(false);
      setUpdateStatus("available");
      setAvailableVersion(info.version);
    });

    const unsubscribeNotAvailable = window.consoleAPI?.onUpdateNotAvailable(() => {
      logger.info("No update available - app is up to date");
      setIsCheckingForUpdates(false);
      setUpdateStatus("up-to-date");
      setTimeout(() => setUpdateStatus("idle"), 5000);
    });

    const unsubscribeError = window.consoleAPI?.onUpdateError((error) => {
      logger.error("Update check error:", error.message);
      setIsCheckingForUpdates(false);
      setUpdateStatus("error");
      setUpdateError(error.message);
      setDownloadProgress(null);
    });

    const unsubscribeProgress = window.consoleAPI?.onUpdateDownloadProgress((progress) => {
      logger.info("Download progress:", progress.percent.toFixed(1) + "%");
      setDownloadProgress({
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
      });
    });

    const unsubscribeDownloaded = window.consoleAPI?.onUpdateDownloaded(() => {
      logger.info("Update downloaded, ready to install");
      setUpdateStatus("downloaded");
      setDownloadProgress(null);
    });

    return () => {
      unsubscribeAvailable?.();
      unsubscribeNotAvailable?.();
      unsubscribeError?.();
      unsubscribeProgress?.();
      unsubscribeDownloaded?.();
    };
  }, []);

  const loadLinearStatus = async () => {
    setIsLinearLoading(true);
    try {
      const token = authService.getAccessToken();
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/api/integrations/linear/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setLinearStatus(data);
      }
    } catch (error) {
      logger.error("Error loading Linear status:", error);
    } finally {
      setIsLinearLoading(false);
    }
  };

  const loadGmailStatus = async () => {
    setIsGmailLoading(true);
    try {
      const token = authService.getAccessToken();
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/api/integrations/gmail/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setGmailStatus(data);
      }
    } catch (error) {
      logger.error("Error loading Gmail status:", error);
    } finally {
      setIsGmailLoading(false);
    }
  };

  const loadAppVersion = async () => {
    try {
      const version = await window.consoleAPI?.getAppVersion();
      if (version) {
        setAppVersion(version);
      }
    } catch (error) {
      logger.error("Error loading app version:", error);
    }
  };

  const handleCheckForUpdates = async () => {
    setIsCheckingForUpdates(true);
    setUpdateStatus("checking");
    setUpdateError(null);
    try {
      await window.consoleAPI?.checkForUpdates();
    } catch (error) {
      logger.error("Error checking for updates:", error);
      setIsCheckingForUpdates(false);
      setUpdateStatus("error");
      setUpdateError("Failed to check for updates");
    }
  };

  const handleDownloadUpdate = async () => {
    setUpdateStatus("downloading");
    setUpdateError(null);
    setDownloadProgress({ percent: 0, transferred: 0, total: 0 });
    try {
      await window.consoleAPI?.downloadUpdate();
    } catch (error) {
      logger.error("Error downloading update:", error);
      setUpdateStatus("error");
      setUpdateError("Failed to download update");
      setDownloadProgress(null);
    }
  };

  const handleInstallUpdate = () => {
    try {
      window.consoleAPI?.installUpdate();
    } catch (error) {
      logger.error("Error installing update:", error);
      setUpdateStatus("error");
      setUpdateError("Failed to install update");
    }
  };

  const handleConnectLinear = async () => {
    setIsConnecting(true);
    try {
      const token = authService.getAccessToken();
      if (!token) {
        toast({
          title: "Error",
          description: "Not authenticated. Please log in again.",
          variant: "destructive",
        });
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/integrations/linear/oauth/start`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to start Linear OAuth");
      }

      const { authUrl } = await response.json();
      window.open(authUrl, "_blank");

      toast({
        title: "Complete in Browser",
        description: "Please complete the Linear authorization in your browser, then return here.",
      });

      const pollInterval = setInterval(async () => {
        try {
          const token = authService.getAccessToken();
          if (!token) return;

          const resp = await fetch(`${API_BASE_URL}/api/integrations/linear/status`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (resp.ok) {
            const data = await response.json();
            setLinearStatus(data);
            if (data.connected) {
              clearInterval(pollInterval);
              toast({
                title: "Linear Connected",
                description: "Your Linear account has been connected successfully!",
              });
            }
          }
        } catch (err) {
          logger.error("Polling error:", err);
        }
      }, 2000);

      setTimeout(() => clearInterval(pollInterval), 120000);
    } catch (error) {
      logger.error("Error connecting Linear:", error);
      toast({
        title: "Connection Failed",
        description: "Failed to connect to Linear. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectLinear = async () => {
    setIsDisconnecting(true);
    try {
      const token = authService.getAccessToken();
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/api/integrations/linear/disconnect`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        setLinearStatus({ connected: false, expired: false });
        toast({
          title: "Linear Disconnected",
          description: "Your Linear account has been disconnected.",
        });
      }
    } catch (error) {
      logger.error("Error disconnecting Linear:", error);
      toast({
        title: "Error",
        description: "Failed to disconnect Linear. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleConnectGmail = async () => {
    setIsGmailConnecting(true);
    try {
      const token = authService.getAccessToken();
      if (!token) {
        toast({
          title: "Error",
          description: "Not authenticated. Please log in again.",
          variant: "destructive",
        });
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/integrations/gmail/oauth/start`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to start Gmail OAuth");
      }

      const { authUrl } = await response.json();
      window.open(authUrl, "_blank");

      toast({
        title: "Complete in Browser",
        description: "Please complete the Gmail authorization in your browser, then return here.",
      });

      const pollInterval = setInterval(async () => {
        try {
          const token = authService.getAccessToken();
          if (!token) return;

          const resp = await fetch(`${API_BASE_URL}/api/integrations/gmail/status`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (resp.ok) {
            const data = await resp.json();
            setGmailStatus(data);
            if (data.connected) {
              clearInterval(pollInterval);
              toast({
                title: "Gmail Connected",
                description: `Your Gmail account (${data.email}) has been connected successfully!`,
              });
            }
          }
        } catch (err) {
          logger.error("Polling error:", err);
        }
      }, 2000);

      setTimeout(() => clearInterval(pollInterval), 120000);
    } catch (error) {
      logger.error("Error connecting Gmail:", error);
      toast({
        title: "Connection Failed",
        description: "Failed to connect to Gmail. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGmailConnecting(false);
    }
  };

  const handleDisconnectGmail = async () => {
    setIsGmailDisconnecting(true);
    try {
      const token = authService.getAccessToken();
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/api/integrations/gmail/disconnect`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        setGmailStatus({ connected: false, expired: false, email: null });
        toast({
          title: "Gmail Disconnected",
          description: "Your Gmail account has been disconnected.",
        });
      }
    } catch (error) {
      logger.error("Error disconnecting Gmail:", error);
      toast({
        title: "Error",
        description: "Failed to disconnect Gmail. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGmailDisconnecting(false);
    }
  };

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

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure your new passwords match",
        variant: "destructive",
      });
      return;
    }

    // Validate password requirements
    const failedRequirements = requirements.filter((req) => !req.test(newPassword));
    if (failedRequirements.length > 0) {
      toast({
        title: "Password requirements not met",
        description: "Please ensure your password meets all security requirements",
        variant: "destructive",
      });
      return;
    }

    setIsChangingPassword(true);

    try {
      await authService.changePassword(currentPassword, newPassword);

      toast({
        title: "Password changed successfully",
        description: "Your password has been updated",
      });

      // Clear form
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      toast({
        title: "Failed to change password",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Tab state
  const [activeTab, setActiveTab] = useState<"account" | "security" | "integrations" | "about">(
    "account"
  );

  const tabs = [
    { id: "account" as const, label: "Account", icon: User },
    { id: "security" as const, label: "Security", icon: Lock },
    { id: "integrations" as const, label: "Integrations", icon: Link2 },
    { id: "about" as const, label: "About", icon: Info },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-8">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-heading-2 text-white">Profile & Settings</h1>
            <p className="text-body-sm text-text-secondary mt-1">
              Manage your account, integrations, preferences, and security
            </p>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 border-b border-border-subtle mb-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? "border-primary-light text-white"
                    : "border-transparent text-text-secondary hover:text-text-primary"
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="space-y-6">
            {/* Account Tab */}
            {activeTab === "account" && (
              <div className="space-y-6">
                {/* Account Information Section */}
                <div className="bg-background-secondary rounded-xl border border-border-subtle p-6 space-y-6">
                  <div className="flex items-center gap-3 pb-4 border-b border-border-subtle">
                    <div className="w-10 h-10 bg-primary-light/20 rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-primary-light" />
                    </div>
                    <div>
                      <h2 className="text-heading-4 text-white">Account Information</h2>
                      <p className="text-body-sm text-text-tertiary">Your profile details</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-text-secondary">Name</label>
                      <div className="flex h-10 w-full rounded-md border border-border-subtle bg-background-elevated px-3 py-2 text-sm text-white">
                        {user?.name || "Not set"}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-text-secondary">Email</label>
                      <div className="flex h-10 w-full rounded-md border border-border-subtle bg-background-elevated px-3 py-2 text-sm text-white">
                        {user?.email || "Not available"}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-text-secondary">Role</label>
                      <div className="flex h-10 w-full rounded-md border border-border-subtle bg-background-elevated px-3 py-2 text-sm">
                        <span className="capitalize text-primary-light font-medium">
                          {user?.role || "Employee"}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-text-secondary">
                        Organization ID
                      </label>
                      <div className="flex h-10 w-full rounded-md border border-border-subtle bg-background-elevated px-3 py-2 text-sm text-text-tertiary font-mono text-xs">
                        {user?.organizationId || "Not available"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Subscription Section */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Subscription</h3>
                  <BillingSection />
                </div>
              </div>
            )}

            {/* Security Tab */}
            {activeTab === "security" && (
              <div className="bg-background-secondary rounded-xl border border-border-subtle p-6">
                <div className="space-y-6">
                  <div className="pb-4 border-b border-border-subtle">
                    <h2 className="text-heading-4 text-white">Security</h2>
                    <p className="text-body-sm text-text-tertiary mt-1">
                      Update your password to keep your account secure
                    </p>
                  </div>

                  <form onSubmit={handlePasswordChange} className="space-y-6">
                    {/* Current Password */}
                    <div className="space-y-2">
                      <label
                        htmlFor="currentPassword"
                        className="text-sm font-medium text-text-primary"
                      >
                        Current Password
                      </label>
                      <div className="relative">
                        <input
                          id="currentPassword"
                          type={showCurrentPassword ? "text" : "password"}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          required
                          disabled={isChangingPassword}
                          placeholder="Enter your current password"
                          className="flex h-10 w-full rounded-md border border-border-subtle bg-background-elevated px-3 py-2 pr-10 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          disabled={isChangingPassword}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-50"
                        >
                          {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    {/* New Password */}
                    <div className="space-y-2">
                      <label
                        htmlFor="newPassword"
                        className="text-sm font-medium text-text-primary"
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
                          disabled={isChangingPassword}
                          placeholder="Enter your new password"
                          className="flex h-10 w-full rounded-md border border-border-subtle bg-background-elevated px-3 py-2 pr-10 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          disabled={isChangingPassword}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-50"
                        >
                          {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>

                      {/* Password strength indicator */}
                      {newPassword && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-background-elevated rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all duration-300 ${strengthColors[passwordStrength]} ${strengthWidth[passwordStrength]}`}
                              />
                            </div>
                            <span className="text-xs text-text-secondary capitalize min-w-[60px]">
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
                        className="text-sm font-medium text-text-primary"
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
                          disabled={isChangingPassword}
                          placeholder="Confirm your new password"
                          className="flex h-10 w-full rounded-md border border-border-subtle bg-background-elevated px-3 py-2 pr-10 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          disabled={isChangingPassword}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-50"
                        >
                          {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>

                      {/* Password Match Indicator */}
                      {confirmPassword && newPassword && (
                        <div className="flex items-center gap-2 text-xs">
                          {confirmPassword === newPassword ? (
                            <>
                              <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                              <span className="text-green-400">Passwords match</span>
                            </>
                          ) : (
                            <>
                              <X className="w-4 h-4 text-red-400 flex-shrink-0" />
                              <span className="text-red-400">Passwords don't match</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Password requirements */}
                    {newPassword && (
                      <div className="space-y-2 p-4 bg-background-elevated/50 rounded-lg border border-border-subtle">
                        <p className="text-xs font-medium text-text-secondary mb-3">
                          Password must contain:
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {requirements.map((req, idx) => {
                            const isMet = req.test(newPassword);
                            return (
                              <div key={idx} className="flex items-center gap-2 text-xs">
                                {isMet ? (
                                  <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                                ) : (
                                  <X className="w-4 h-4 text-text-tertiary flex-shrink-0" />
                                )}
                                <span className={isMet ? "text-green-400" : "text-text-tertiary"}>
                                  {req.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="pt-4">
                      <Button
                        type="submit"
                        disabled={isChangingPassword}
                        className="w-full md:w-auto"
                      >
                        {isChangingPassword ? "Changing Password..." : "Change Password"}
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Integrations Tab */}
            {activeTab === "integrations" && (
              <div className="space-y-6">
                {/* Linear Integration Card */}
                <Card className="p-6 bg-background-elevated border-border-subtle">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#5E6AD2] rounded-lg flex items-center justify-center flex-shrink-0">
                      <SiLinear className="w-6 h-6 text-white" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-white">Linear</h3>
                      <p className="text-sm text-text-tertiary">
                        Connect your Linear account to send session updates to your tickets.
                      </p>
                    </div>

                    {isLinearLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
                    ) : linearStatus?.connected ? (
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-sm text-green-400">
                          <Check className="w-4 h-4" />
                          Connected
                        </span>
                        <ShadcnButton
                          variant="ghost"
                          size="sm"
                          onClick={handleDisconnectLinear}
                          disabled={isDisconnecting}
                          className="text-text-tertiary hover:text-red-400"
                        >
                          {isDisconnecting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Unlink className="w-4 h-4" />
                          )}
                        </ShadcnButton>
                      </div>
                    ) : (
                      <ShadcnButton
                        onClick={handleConnectLinear}
                        disabled={isConnecting}
                        className="bg-[#5E6AD2] hover:bg-[#4F5ABF] text-white gap-2"
                      >
                        {isConnecting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Link2 className="w-4 h-4" />
                        )}
                        Connect
                      </ShadcnButton>
                    )}
                  </div>

                  {linearStatus?.expired && (
                    <div className="mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                      <p className="text-sm text-yellow-400">
                        Your Linear connection has expired. Please reconnect to continue sending
                        updates.
                      </p>
                    </div>
                  )}
                </Card>

                {/* Gmail Integration Card */}
                <Card className="p-6 bg-background-elevated border-border-subtle">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
                      <SiGmail className="w-6 h-6 text-[#EA4335]" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-white">Gmail</h3>
                      <p className="text-sm text-text-tertiary">
                        Connect your Gmail to send session summaries from your email.
                      </p>
                      {gmailStatus?.connected && gmailStatus.email && (
                        <p className="text-xs text-text-tertiary mt-1">{gmailStatus.email}</p>
                      )}
                    </div>

                    {isGmailLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
                    ) : gmailStatus?.connected ? (
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-sm text-green-400">
                          <Check className="w-4 h-4" />
                          Connected
                        </span>
                        <ShadcnButton
                          variant="ghost"
                          size="sm"
                          onClick={handleDisconnectGmail}
                          disabled={isGmailDisconnecting}
                          className="text-text-tertiary hover:text-red-400"
                        >
                          {isGmailDisconnecting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Unlink className="w-4 h-4" />
                          )}
                        </ShadcnButton>
                      </div>
                    ) : (
                      <ShadcnButton
                        onClick={handleConnectGmail}
                        disabled={isGmailConnecting}
                        className="bg-[#EA4335] hover:bg-[#D33426] text-white gap-2"
                      >
                        {isGmailConnecting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Mail className="w-4 h-4" />
                        )}
                        Connect
                      </ShadcnButton>
                    )}
                  </div>

                  {gmailStatus?.expired && (
                    <div className="mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                      <p className="text-sm text-yellow-400">
                        Your Gmail connection has expired. Please reconnect to continue sending
                        emails.
                      </p>
                    </div>
                  )}
                </Card>
              </div>
            )}

            {/* About Tab */}
            {activeTab === "about" && (
              <Card className="p-6 bg-background-elevated border-border-subtle">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Info className="w-6 h-6 text-primary" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-white">Mitable</h3>
                    <p className="text-sm text-text-tertiary">Version {appVersion || "..."}</p>
                  </div>

                  <ShadcnButton
                    onClick={
                      updateStatus === "available"
                        ? handleDownloadUpdate
                        : updateStatus === "downloaded"
                          ? handleInstallUpdate
                          : handleCheckForUpdates
                    }
                    disabled={isCheckingForUpdates || updateStatus === "downloading"}
                    variant={updateStatus === "downloaded" ? "default" : "outline"}
                    className={
                      updateStatus === "downloaded"
                        ? "gap-2 bg-primary hover:bg-primary/90 text-white"
                        : "gap-2 border-border-subtle bg-background-elevated text-text-primary hover:bg-background-tertiary hover:text-white"
                    }
                  >
                    {isCheckingForUpdates ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Checking...
                      </>
                    ) : updateStatus === "up-to-date" ? (
                      <>
                        <Check className="w-4 h-4 text-green-400" />
                        Up to date
                      </>
                    ) : updateStatus === "available" ? (
                      <>
                        <Download className="w-4 h-4" />
                        Download v{availableVersion}
                      </>
                    ) : updateStatus === "downloading" ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Downloading...
                      </>
                    ) : updateStatus === "downloaded" ? (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Install & Restart
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Check for Updates
                      </>
                    )}
                  </ShadcnButton>
                </div>

                {/* Download Progress Bar */}
                {updateStatus === "downloading" && downloadProgress && (
                  <div className="mt-4 space-y-2">
                    <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300 ease-out"
                        style={{ width: `${downloadProgress.percent}%` }}
                      />
                    </div>
                    <p className="text-xs text-text-tertiary">
                      {downloadProgress.percent.toFixed(0)}% —{" "}
                      {(downloadProgress.transferred / 1024 / 1024).toFixed(1)} MB /{" "}
                      {(downloadProgress.total / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                )}

                {/* Error State */}
                {updateStatus === "error" && updateError && (
                  <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-sm text-red-400">{updateError}</p>
                  </div>
                )}

                {/* Release Notes Link */}
                <div className="mt-4 pt-4 border-t border-border-subtle">
                  <a
                    href="https://github.com/Febchuk/mitable/releases"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    View release notes
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
