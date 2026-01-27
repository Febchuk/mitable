import { useState, FormEvent, useEffect, useCallback, useRef } from "react";
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
  Settings,
  Shield,
  Plus,
} from "lucide-react";
import { SiLinear, SiGmail, SiNotion } from "react-icons/si";
import Button from "../components/ui/Button";
import { Button as ShadcnButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { authService } from "../services/authService";
import { useUser } from "../context/UserContext";
import { useToast } from "@/hooks/use-toast";
import { BillingSection } from "@/console/src/components/billing";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { usePreferences } from "@/console/src/hooks/usePreferences";
import { createLogger } from "../../../lib/logger";
import { API_BASE_URL } from "../lib/config";
import MultiSelectPicker from "../components/shared/MultiSelectPicker/index";

const logger = createLogger("UserProfilePage");

interface LinearStatus {
  connected: boolean;
  expired: boolean;
}

interface GmailStatus {
  connected: boolean;
  expired: boolean;
  email: string | null;
}

interface NotionStatus {
  connected: boolean;
  expired: boolean;
  workspaceId: string | null;
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

  const [notionStatus, setNotionStatus] = useState<NotionStatus | null>(null);
  const [isNotionLoading, setIsNotionLoading] = useState(true);
  const [isNotionConnecting, setIsNotionConnecting] = useState(false);
  const [isNotionDisconnecting, setIsNotionDisconnecting] = useState(false);

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

  // Preferences hook
  const {
    showPillOnSessionStart,
    hidePillOnSessionEnd,
    enableBatchedClassifier,
    isLoading: isPreferencesLoading,
    updatePreference,
  } = usePreferences();

  // Block list state
  const [blockedApps, setBlockedApps] = useState<string[]>([]);
  const [detectedApps, setDetectedApps] = useState<
    Array<{ normalizedName: string; originalName: string }>
  >([]);
  const [isBlockListLoading, setIsBlockListLoading] = useState(true);

  // Notification frequency state
  const [notificationFrequency, setNotificationFrequency] = useState<number>(30);
  const [isNotificationFrequencyLoading, setIsNotificationFrequencyLoading] = useState(true);

  // Auto session start state
  const [autoSessionStart, setAutoSessionStart] = useState<boolean>(false);
  const [isAutoSessionStartLoading, setIsAutoSessionStartLoading] = useState(true);

  // OAuth polling interval refs - for cleanup on unmount
  const linearPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const gmailPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const notionPollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup OAuth polling intervals on unmount
  useEffect(() => {
    return () => {
      if (linearPollIntervalRef.current) {
        clearInterval(linearPollIntervalRef.current);
      }
      if (gmailPollIntervalRef.current) {
        clearInterval(gmailPollIntervalRef.current);
      }
      if (notionPollIntervalRef.current) {
        clearInterval(notionPollIntervalRef.current);
      }
    };
  }, []);

  // Block list functions
  const loadBlockList = useCallback(async () => {
    if (!user?.id) return;
    try {
      setIsBlockListLoading(true);
      const apps = await window.consoleAPI.getBlockList(user.id);
      setBlockedApps(apps);
    } catch (error) {
      logger.error("Error loading block list:", error);
      toast({
        title: "Error",
        description: "Failed to load blocked apps.",
        variant: "destructive",
      });
    } finally {
      setIsBlockListLoading(false);
    }
  }, [user?.id, toast]);

  const loadDetectedApps = useCallback(async () => {
    try {
      const apps = await window.consoleAPI.getDetectedApps();
      setDetectedApps(apps);
    } catch (error) {
      logger.error("Error loading detected apps:", error);
    }
  }, []);

  // Helper function to clean app names (remove .app, .exe, .AppImage suffixes)
  const cleanAppName = (appName: string): string => {
    return appName.replace(/\.(app|exe|AppImage)$/i, "");
  };

  const handleAddBlockedApp = async (appName: string) => {
    if (!user?.id) return;
    try {
      await window.consoleAPI.addBlockedApp(user.id, appName);
      await loadBlockList();
      const detectedApp = detectedApps.find((a) => a.normalizedName === appName.toLowerCase());
      const displayName = cleanAppName(detectedApp?.originalName || appName);
      toast({
        title: "App blocked",
        description: `${displayName} has been added to your block list.`,
      });
    } catch (error) {
      logger.error("Error adding blocked app:", error);
      toast({
        title: "Error",
        description: "Failed to block app.",
        variant: "destructive",
      });
    }
  };

  const handleRemoveBlockedApp = async (appName: string) => {
    if (!user?.id) return;
    try {
      await window.consoleAPI.removeBlockedApp(user.id, appName);
      await loadBlockList();
      const detectedApp = detectedApps.find((a) => a.normalizedName === appName.toLowerCase());
      const displayName = cleanAppName(detectedApp?.originalName || appName);
      toast({
        title: "App unblocked",
        description: `${displayName} has been removed from your block list.`,
      });
    } catch (error) {
      logger.error("Error removing blocked app:", error);
      toast({
        title: "Error",
        description: "Failed to unblock app.",
        variant: "destructive",
      });
    }
  };

  // Notification frequency functions
  const loadNotificationFrequency = useCallback(async () => {
    if (!user?.id) return;
    try {
      setIsNotificationFrequencyLoading(true);
      const frequency = await window.consoleAPI.getNotificationFrequency(user.id);
      setNotificationFrequency(frequency);
    } catch (error) {
      logger.error("Error loading notification frequency:", error);
      toast({
        title: "Error",
        description: "Failed to load notification frequency.",
        variant: "destructive",
      });
    } finally {
      setIsNotificationFrequencyLoading(false);
    }
  }, [user?.id, toast]);

  const handleNotificationFrequencyChange = async (minutes: number) => {
    if (!user?.id) return;
    try {
      const result = await window.consoleAPI.setNotificationFrequency(user.id, minutes);
      if (result.success) {
        setNotificationFrequency(minutes);
        toast({
          title: "Preference saved",
          description: `Reminder notifications will appear every ${minutes} minutes.`,
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to save notification frequency.",
          variant: "destructive",
        });
      }
    } catch (error) {
      logger.error("Error setting notification frequency:", error);
      toast({
        title: "Error",
        description: "Failed to save notification frequency.",
        variant: "destructive",
      });
    }
  };

  // Auto session start functions
  const loadAutoSessionStart = useCallback(async () => {
    if (!user?.id) return;
    try {
      setIsAutoSessionStartLoading(true);
      const enabled = await window.consoleAPI.getAutoSessionStart(user.id);
      setAutoSessionStart(enabled);
    } catch (error) {
      logger.error("Error loading auto session start:", error);
      toast({
        title: "Error",
        description: "Failed to load auto session start preference.",
        variant: "destructive",
      });
    } finally {
      setIsAutoSessionStartLoading(false);
    }
  }, [user?.id, toast]);

  const handleAutoSessionStartChange = async (enabled: boolean) => {
    if (!user?.id) return;
    try {
      const result = await window.consoleAPI.setAutoSessionStart(user.id, enabled);
      if (result.success) {
        setAutoSessionStart(enabled);
        toast({
          title: "Preference saved",
          description: enabled
            ? "Sessions will automatically start when your computer wakes from sleep."
            : "Auto session start disabled.",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to save auto session start preference.",
          variant: "destructive",
        });
      }
    } catch (error) {
      logger.error("Error setting auto session start:", error);
      toast({
        title: "Error",
        description: "Failed to save auto session start preference.",
        variant: "destructive",
      });
    }
  };

  // Customer Profile state
  const [jobTitle, setJobTitle] = useState("");
  const [regularTasks, setRegularTasks] = useState<string[]>([]);
  const [regularApps, setRegularApps] = useState<string[]>([]);
  const [additionalContext, setAdditionalContext] = useState("");
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Predefined options
  const regularAppsOptions = [
    "Cursor",
    "Slack",
    "Chrome",
    "Safari",
    "Figma",
    "Granola",
    "Linear",
    "VS Code",
    "Terminal",
    "Notion",
    "Obsidian",
    "Spotify",
    "Zoom",
    "Teams",
    "Discord",
  ];

  const regularTasksOptions = [
    "Email",
    "Coding",
    "Research",
    "Design",
    "Communication",
    "Planning",
    "Writing",
    "Reviewing",
    "Debugging",
    "Testing",
    "Documentation",
    "Meetings",
    "Learning",
  ];

  useEffect(() => {
    loadLinearStatus();
    loadGmailStatus();
    loadNotionStatus();
    loadAppVersion();
    loadUserProfile();
    if (user?.id) {
      loadBlockList();
      loadDetectedApps();
      loadNotificationFrequency();
      loadAutoSessionStart();
    }
  }, [user?.id, loadBlockList, loadDetectedApps, loadNotificationFrequency, loadAutoSessionStart]);

  const loadUserProfile = async () => {
    setIsLoadingProfile(true);
    try {
      const token = authService.getAccessToken();
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        const profile = data.profile;
        setJobTitle(profile.jobTitle || "");
        setRegularTasks((profile.regularTasks as string[]) || []);
        setRegularApps((profile.regularApps as string[]) || []);
        setAdditionalContext(profile.additionalContext || "");
      }
    } catch (error) {
      logger.error("Error loading user profile:", error);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
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

      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobTitle: jobTitle || null,
          regularTasks,
          regularApps,
          additionalContext: additionalContext || null,
        }),
      });

      if (response.ok) {
        toast({
          title: "Profile updated",
          description: "Your customer profile has been saved successfully.",
        });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to save profile");
      }
    } catch (error) {
      logger.error("Error saving profile:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save profile",
        variant: "destructive",
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

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

  const loadNotionStatus = async () => {
    setIsNotionLoading(true);
    try {
      const token = authService.getAccessToken();
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/api/integrations/notion/user/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setNotionStatus(data);
      }
    } catch (error) {
      logger.error("Error loading Notion status:", error);
    } finally {
      setIsNotionLoading(false);
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
            const data = await resp.json();
            setLinearStatus(data);
            if (data.connected) {
              clearInterval(pollInterval);
              linearPollIntervalRef.current = null;
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

      linearPollIntervalRef.current = pollInterval;
      setTimeout(() => {
        clearInterval(pollInterval);
        linearPollIntervalRef.current = null;
      }, 120000);
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
              gmailPollIntervalRef.current = null;
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

      gmailPollIntervalRef.current = pollInterval;
      setTimeout(() => {
        clearInterval(pollInterval);
        gmailPollIntervalRef.current = null;
      }, 120000);
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

  const handleConnectNotion = async () => {
    setIsNotionConnecting(true);
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

      const response = await fetch(`${API_BASE_URL}/api/integrations/notion/user/oauth/start`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to start Notion OAuth");
      }

      const { authUrl } = await response.json();
      window.open(authUrl, "_blank");

      toast({
        title: "Complete in Browser",
        description: "Please complete the Notion authorization in your browser, then return here.",
      });

      const pollInterval = setInterval(async () => {
        try {
          const token = authService.getAccessToken();
          if (!token) return;

          const resp = await fetch(`${API_BASE_URL}/api/integrations/notion/user/status`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (resp.ok) {
            const data = await resp.json();
            setNotionStatus(data);
            if (data.connected) {
              clearInterval(pollInterval);
              notionPollIntervalRef.current = null;
              toast({
                title: "Notion Connected",
                description: "Your Notion workspace has been connected successfully!",
              });
            }
          }
        } catch (err) {
          logger.error("Polling error:", err);
        }
      }, 2000);

      notionPollIntervalRef.current = pollInterval;
      setTimeout(() => {
        clearInterval(pollInterval);
        notionPollIntervalRef.current = null;
      }, 120000);
    } catch (error) {
      logger.error("Error connecting Notion:", error);
      toast({
        title: "Connection Failed",
        description: "Failed to connect to Notion. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsNotionConnecting(false);
    }
  };

  const handleDisconnectNotion = async () => {
    setIsNotionDisconnecting(true);
    try {
      const token = authService.getAccessToken();
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/api/integrations/notion/user/disconnect`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        setNotionStatus({ connected: false, expired: false, workspaceId: null });
        toast({
          title: "Notion Disconnected",
          description: "Your Notion workspace has been disconnected.",
        });
      }
    } catch (error) {
      logger.error("Error disconnecting Notion:", error);
      toast({
        title: "Error",
        description: "Failed to disconnect Notion. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsNotionDisconnecting(false);
    }
  };

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
  const [activeTab, setActiveTab] = useState<
    "account" | "security" | "preferences" | "integrations" | "about"
  >("account");

  const tabs = [
    { id: "account" as const, label: "Account", icon: User },
    { id: "security" as const, label: "Security", icon: Lock },
    { id: "preferences" as const, label: "Preferences", icon: Settings },
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

                {/* Customer Profile Section */}
                <div className="bg-background-secondary rounded-xl border border-border-subtle p-6 space-y-6">
                  <div className="flex items-center gap-3 pb-4 border-b border-border-subtle">
                    <div className="w-10 h-10 bg-primary-light/20 rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-primary-light" />
                    </div>
                    <div>
                      <h2 className="text-heading-4 text-white">Customer Profile</h2>
                      <p className="text-body-sm text-text-tertiary">
                        Help us understand your work context to improve session classification
                      </p>
                    </div>
                  </div>

                  {isLoadingProfile ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-text-tertiary" />
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Job Title */}
                      <div className="space-y-2">
                        <label
                          htmlFor="jobTitle"
                          className="text-sm font-medium text-text-secondary"
                        >
                          Job Title
                        </label>
                        <input
                          id="jobTitle"
                          type="text"
                          value={jobTitle}
                          onChange={(e) => setJobTitle(e.target.value)}
                          placeholder="e.g., Software Engineer, Designer, Product Manager"
                          maxLength={100}
                          disabled={isSavingProfile}
                          className="flex h-10 w-full rounded-md border border-border-subtle bg-background-elevated px-3 py-2 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-all"
                        />
                      </div>

                      {/* Regular Apps */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-text-secondary">
                          Regular Apps
                        </label>
                        <p className="text-xs text-text-tertiary">
                          Select the applications you use regularly in your work
                        </p>
                        <MultiSelectPicker
                          options={regularAppsOptions}
                          selectedValues={regularApps}
                          onSelectionChange={setRegularApps}
                          placeholder="Select apps you use regularly..."
                          disabled={isSavingProfile}
                        />
                      </div>

                      {/* Regular Tasks */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-text-secondary">
                          Regular Tasks
                        </label>
                        <p className="text-xs text-text-tertiary">
                          Select the types of tasks you perform regularly
                        </p>
                        <MultiSelectPicker
                          options={regularTasksOptions}
                          selectedValues={regularTasks}
                          onSelectionChange={setRegularTasks}
                          placeholder="Select tasks you perform regularly..."
                          disabled={isSavingProfile}
                        />
                      </div>

                      {/* Additional Context */}
                      <div className="space-y-2">
                        <label
                          htmlFor="additionalContext"
                          className="text-sm font-medium text-text-secondary"
                        >
                          Additional Context
                        </label>
                        <p className="text-xs text-text-tertiary">
                          Any other information that would help us understand your work better
                        </p>
                        <textarea
                          id="additionalContext"
                          value={additionalContext}
                          onChange={(e) => setAdditionalContext(e.target.value)}
                          placeholder="e.g., I work primarily on frontend features, focus on accessibility..."
                          rows={4}
                          disabled={isSavingProfile}
                          className="flex w-full rounded-md border border-border-subtle bg-background-elevated px-3 py-2 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-all resize-none"
                        />
                      </div>

                      {/* Save Button */}
                      <div className="pt-4">
                        <Button
                          onClick={handleSaveProfile}
                          disabled={isSavingProfile}
                          className="w-full md:w-auto"
                        >
                          {isSavingProfile ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            "Save Profile"
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
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

            {/* Preferences Tab */}
            {activeTab === "preferences" && (
              <div className="bg-background-secondary rounded-xl border border-border-subtle p-6">
                <div className="space-y-6">
                  <div className="pb-4 border-b border-border-subtle">
                    <h2 className="text-heading-4 text-white">Session Preferences</h2>
                    <p className="text-body-sm text-text-tertiary mt-1">
                      Customize how monitoring sessions behave
                    </p>
                  </div>

                  {/* Show Pill on Session Start Toggle */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5 flex-1 pr-4">
                      <Label
                        htmlFor="show-pill-toggle-profile"
                        className="text-sm font-medium text-text-primary cursor-pointer"
                      >
                        Show Watching Pill on Session Start
                      </Label>
                      <p className="text-xs text-text-tertiary">
                        Automatically show the watching pill when a monitoring session starts
                      </p>
                    </div>
                    {isPreferencesLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin text-text-tertiary flex-shrink-0" />
                    ) : (
                      <Switch
                        id="show-pill-toggle-profile"
                        checked={showPillOnSessionStart}
                        onCheckedChange={async (checked) => {
                          const result = await updatePreference("showPillOnSessionStart", checked);
                          if (result.success) {
                            toast({
                              title: "Preference saved",
                              description: checked
                                ? "Watching pill will show when sessions start"
                                : "Watching pill will not auto-show when sessions start",
                            });
                          } else {
                            toast({
                              title: "Error",
                              description: "Failed to save preference",
                              variant: "destructive",
                            });
                          }
                        }}
                        className="flex-shrink-0"
                      />
                    )}
                  </div>

                  {/* Hide Pill on Session End Toggle */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5 flex-1 pr-4">
                      <Label
                        htmlFor="hide-pill-toggle-profile"
                        className="text-sm font-medium text-text-primary cursor-pointer"
                      >
                        Hide Watching Pill on Session End
                      </Label>
                      <p className="text-xs text-text-tertiary">
                        Automatically hide the watching pill when a monitoring session ends
                      </p>
                    </div>
                    {isPreferencesLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin text-text-tertiary flex-shrink-0" />
                    ) : (
                      <Switch
                        id="hide-pill-toggle-profile"
                        checked={hidePillOnSessionEnd}
                        onCheckedChange={async (checked) => {
                          const result = await updatePreference("hidePillOnSessionEnd", checked);
                          if (result.success) {
                            toast({
                              title: "Preference saved",
                              description: checked
                                ? "Watching pill will be hidden when sessions end"
                                : "Watching pill will remain visible when sessions end",
                            });
                          } else {
                            toast({
                              title: "Error",
                              description: "Failed to save preference",
                              variant: "destructive",
                            });
                          }
                        }}
                        className="flex-shrink-0"
                      />
                    )}
                  </div>

                  {/* Enable Batched Classifier Toggle */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5 flex-1 pr-4">
                      <Label
                        htmlFor="batched-classifier-toggle-profile"
                        className="text-sm font-medium text-text-primary cursor-pointer"
                      >
                        Use Batched Analysis (1-minute windows)
                      </Label>
                      <p className="text-xs text-text-tertiary">
                        When enabled, screenshots are analyzed in 1-minute batches for better cost efficiency and reduced rate limiting. When disabled, uses 10-second interval analysis.
                      </p>
                      <p className="text-xs text-text-tertiary italic mt-1">
                        Leave this on for increased activity timeline performance during sessions
                      </p>
                    </div>
                    {isPreferencesLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin text-text-tertiary flex-shrink-0" />
                    ) : (
                      <Switch
                        id="batched-classifier-toggle-profile"
                        checked={enableBatchedClassifier}
                        onCheckedChange={async (checked) => {
                          const result = await updatePreference("enableBatchedClassifier", checked);
                          if (result.success) {
                            toast({
                              title: "Preference saved",
                              description: checked
                                ? "Using batched analysis (1-minute windows)"
                                : "Using interval analysis (10-second intervals)",
                            });
                          } else {
                            toast({
                              title: "Error",
                              description: "Failed to save preference",
                              variant: "destructive",
                            });
                          }
                        }}
                        className="flex-shrink-0"
                      />
                    )}
                  </div>

                  {/* Notification Frequency Setting */}
                  <div className="flex items-center justify-between pt-4 border-t border-border-subtle">
                    <div className="space-y-0.5 flex-1 pr-4">
                      <Label
                        htmlFor="notification-frequency-input"
                        className="text-sm font-medium text-text-primary cursor-pointer"
                      >
                        Reminder Notification Frequency
                      </Label>
                      <p className="text-xs text-text-tertiary">
                        How often (in minutes) you'd like to receive reminders to record work
                        sessions
                      </p>
                    </div>
                    {isNotificationFrequencyLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin text-text-tertiary flex-shrink-0" />
                    ) : (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <input
                          id="notification-frequency-input"
                          type="number"
                          min="5"
                          max="240"
                          step="5"
                          value={notificationFrequency}
                          onChange={(e) => {
                            const value = parseInt(e.target.value, 10);
                            if (!isNaN(value) && value >= 5 && value <= 240) {
                              handleNotificationFrequencyChange(value);
                            }
                          }}
                          className="w-20 h-10 rounded-md border border-border-subtle bg-background-elevated px-3 py-2 text-sm text-white text-center focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-transparent"
                        />
                        <span className="text-sm text-text-secondary">minutes</span>
                      </div>
                    )}
                  </div>

                  {/* Auto Session Start Toggle */}
                  <div className="flex items-center justify-between pt-4 border-t border-border-subtle">
                    <div className="space-y-0.5 flex-1 pr-4">
                      <Label
                        htmlFor="auto-session-start-toggle-profile"
                        className="text-sm font-medium text-text-primary cursor-pointer"
                      >
                        Auto Session Start
                      </Label>
                      <p className="text-xs text-text-tertiary">
                        Automatically start a new session when your computer wakes from sleep or
                        unlocks. If a session was already running, it will continue instead.
                      </p>
                    </div>
                    {isAutoSessionStartLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin text-text-tertiary flex-shrink-0" />
                    ) : (
                      <Switch
                        id="auto-session-start-toggle-profile"
                        checked={autoSessionStart}
                        onCheckedChange={handleAutoSessionStartChange}
                        className="flex-shrink-0"
                      />
                    )}
                  </div>

                  {/* Block List Section */}
                  <div className="pt-6 border-t border-border-subtle space-y-4">
                    <div className="flex items-center gap-2">
                      <Shield size={18} className="text-text-tertiary" />
                      <h3 className="text-heading-4 text-white">Blocked Apps</h3>
                    </div>
                    <p className="text-body-sm text-text-tertiary">
                      Apps in this list will never be tracked or captured.
                    </p>

                    {isBlockListLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
                      </div>
                    ) : (
                      <>
                        {/* Currently Blocked Apps */}
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-text-primary">
                            Blocked Apps
                          </Label>
                          {blockedApps.length === 0 ? (
                            <p className="text-xs text-text-tertiary italic">
                              No apps are currently blocked
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {blockedApps.map((appName) => {
                                const detectedApp = detectedApps.find(
                                  (a) => a.normalizedName === appName.toLowerCase()
                                );
                                const displayName = cleanAppName(
                                  detectedApp?.originalName || appName
                                );
                                return (
                                  <div
                                    key={appName}
                                    className="flex items-center gap-1.5 bg-destructive/20 border border-destructive/30 rounded-full pl-3 pr-2 py-1"
                                  >
                                    <span className="text-xs text-white">{displayName}</span>
                                    <button
                                      onClick={() => handleRemoveBlockedApp(appName)}
                                      className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-destructive/30 transition-colors"
                                      aria-label={`Unblock ${displayName}`}
                                    >
                                      <X size={10} className="text-white/70" />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Available Apps to Block */}
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-text-primary">
                            Add App to Block List
                          </Label>
                          {detectedApps.length === 0 ? (
                            <p className="text-xs text-text-tertiary italic">
                              No apps detected yet. Start a session to detect apps on your system.
                            </p>
                          ) : (
                            <div className="max-h-32 overflow-y-auto border border-border-subtle rounded-lg">
                              {detectedApps
                                .filter((app) => !blockedApps.includes(app.normalizedName))
                                .map((app) => {
                                  const displayName = cleanAppName(app.originalName);
                                  return (
                                    <button
                                      key={app.normalizedName}
                                      onClick={() => handleAddBlockedApp(app.normalizedName)}
                                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-background-secondary transition-colors text-left"
                                    >
                                      <Plus size={14} className="text-text-tertiary" />
                                      <span className="text-sm text-white">{displayName}</span>
                                    </button>
                                  );
                                })}
                              {detectedApps.filter(
                                (app) => !blockedApps.includes(app.normalizedName)
                              ).length === 0 && (
                                <div className="px-3 py-2 text-xs text-text-tertiary italic">
                                  All detected apps are already blocked
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
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

                {/* Notion Integration Card */}
                <Card className="p-6 bg-background-elevated border-border-subtle">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
                      <SiNotion className="w-6 h-6 text-black" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-white">Notion</h3>
                      <p className="text-sm text-text-tertiary">
                        Connect your Notion workspace to export documents.
                      </p>
                    </div>

                    {isNotionLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
                    ) : notionStatus?.connected ? (
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-sm text-green-400">
                          <Check className="w-4 h-4" />
                          Connected
                        </span>
                        <ShadcnButton
                          variant="outline"
                          size="sm"
                          onClick={handleConnectNotion}
                          disabled={isNotionConnecting}
                          className="text-text-tertiary hover:text-white border-border-subtle"
                        >
                          {isNotionConnecting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Settings className="w-4 h-4" />
                          )}
                        </ShadcnButton>
                        <ShadcnButton
                          variant="ghost"
                          size="sm"
                          onClick={handleDisconnectNotion}
                          disabled={isNotionDisconnecting}
                          className="text-text-tertiary hover:text-red-400"
                        >
                          {isNotionDisconnecting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Unlink className="w-4 h-4" />
                          )}
                        </ShadcnButton>
                      </div>
                    ) : (
                      <ShadcnButton
                        onClick={handleConnectNotion}
                        disabled={isNotionConnecting}
                        className="bg-black hover:bg-zinc-800 text-white gap-2"
                      >
                        {isNotionConnecting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Link2 className="w-4 h-4" />
                        )}
                        Connect
                      </ShadcnButton>
                    )}
                  </div>

                  {notionStatus?.expired && (
                    <div className="mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                      <p className="text-sm text-yellow-400">
                        Your Notion connection has expired. Please reconnect to continue exporting
                        documents.
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
