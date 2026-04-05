/**
 * SettingsView
 *
 * User settings page with Linear integration connection.
 */

import { useState, useEffect } from "react";
import { useTheme } from "@/console/src/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { createLogger } from "../../../../../../lib/logger";

const logger = createLogger("SettingsView");
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { authService } from "@/console/src/services/authService";
import { usePreferences, useSummaryPreferences } from "@/console/src/hooks/usePreferences";
import {
  Loader2,
  Check,
  Link2,
  Unlink,
  Mail,
  Settings,
  RefreshCw,
  ExternalLink,
  Info,
  Download,
  FileText,
  List,
  Sparkles,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { SiLinear, SiGmail, SiNotion } from "react-icons/si";
import { API_BASE_URL } from "@/console/src/lib/config";

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

export default function SettingsView() {
  const { toast } = useToast();
  const { theme: currentTheme, setTheme } = useTheme();
  const [linearStatus, setLinearStatus] = useState<LinearStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // Gmail state
  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
  const [isGmailLoading, setIsGmailLoading] = useState(true);
  const [isGmailConnecting, setIsGmailConnecting] = useState(false);
  const [isGmailDisconnecting, setIsGmailDisconnecting] = useState(false);

  // Notion state
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

  // Preferences
  const {
    hidePillOnSessionEnd,
    showPillOnSessionStart,
    isLoading: isPreferencesLoading,
    updatePreference,
  } = usePreferences();

  // Summary preferences
  const {
    detailLevel,
    format,
    includeScreenshots,
    alwaysAskOnSessionEnd,
    isLoading: isSummaryPrefsLoading,
    setAlwaysAsk,
    updateDefaults,
  } = useSummaryPreferences();

  useEffect(() => {
    loadLinearStatus();
    loadGmailStatus();
    loadNotionStatus();
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
      // Reset to idle after 5 seconds
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
    setIsLoading(true);
    try {
      const token = authService.getAccessToken();
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/api/integrations/linear/status`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setLinearStatus(data);
      }
    } catch (error) {
      logger.error("Error loading Linear status:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadGmailStatus = async () => {
    setIsGmailLoading(true);
    try {
      const token = authService.getAccessToken();
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/api/integrations/gmail/status`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
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
        headers: {
          Authorization: `Bearer ${token}`,
        },
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
      // The result will come through the event listeners
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
      // Progress updates come through event listeners
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
      // App will quit and install
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

      // Open OAuth URL in default browser
      window.open(authUrl, "_blank");

      toast({
        title: "Complete in Browser",
        description: "Please complete the Linear authorization in your browser, then return here.",
      });

      // Start polling for connection status
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

      // Stop polling after 2 minutes
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
        headers: {
          Authorization: `Bearer ${token}`,
        },
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

      // Open OAuth URL in default browser
      window.open(authUrl, "_blank");

      toast({
        title: "Complete in Browser",
        description: "Please complete the Gmail authorization in your browser, then return here.",
      });

      // Start polling for connection status
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

      // Stop polling after 2 minutes
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
        headers: {
          Authorization: `Bearer ${token}`,
        },
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

      // Open OAuth URL in default browser
      window.open(authUrl, "_blank");

      toast({
        title: "Complete in Browser",
        description: "Please complete the Notion authorization in your browser, then return here.",
      });

      // Start polling for connection status
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

      // Stop polling after 2 minutes
      setTimeout(() => clearInterval(pollInterval), 120000);
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
        headers: {
          Authorization: `Bearer ${token}`,
        },
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

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-4xl font-bold text-text-primary">Settings</h1>
        <p className="text-text-secondary mt-2">Manage your account and integrations</p>
      </div>

      {/* Appearance Section */}
      <div className="space-y-4 max-w-2xl">
        <h2 className="text-2xl font-semibold text-text-primary">Appearance</h2>
        <Card className="p-6 bg-background-elevated border-border-subtle">
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">
              Choose how Mitable looks to you. Select a theme or sync with your system setting.
            </p>
            <div className="flex gap-3">
              {(
                [
                  { value: "light", label: "Light", icon: Sun },
                  { value: "dark", label: "Dark", icon: Moon },
                  { value: "system", label: "System", icon: Monitor },
                ] as const
              ).map(({ value, label, icon: Icon }) => {
                const active = currentTheme === value;
                return (
                  <button
                    key={value}
                    onClick={() => setTheme(value)}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 8,
                      padding: "14px 12px",
                      borderRadius: 10,
                      border: active ? "1.5px solid var(--mi-accent)" : "var(--border-subtle)",
                      background: active ? "rgba(var(--ui-rgb), 0.04)" : "transparent",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!active) e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.04)";
                    }}
                    onMouseLeave={(e) => {
                      if (!active) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <Icon
                      size={20}
                      style={{
                        color: active ? "var(--mi-accent)" : "var(--text-tertiary)",
                      }}
                    />
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: active ? 500 : 400,
                        color: active ? "var(--text-primary)" : "var(--text-secondary)",
                      }}
                    >
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </Card>
      </div>

      {/* Preferences Section */}
      <div className="space-y-4 max-w-2xl">
        <h2 className="text-2xl font-semibold text-text-primary">Preferences</h2>
        <Card className="p-6 bg-background-elevated border-border-subtle">
          <div className="space-y-6">
            {/* Session Preferences */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Settings size={18} className="text-text-secondary" />
                <h3 className="text-lg font-semibold text-text-primary">Session</h3>
              </div>

              {/* Show Pill on Session Start Toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label
                    htmlFor="show-pill-toggle"
                    className="text-sm font-medium text-text-primary cursor-pointer"
                  >
                    Show Watching Pill on Session Start
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically show the watching pill when a monitoring session starts
                  </p>
                </div>

                {isPreferencesLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                ) : (
                  <Switch
                    id="show-pill-toggle"
                    size="sm"
                    className="shrink-0"
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
                  />
                )}
              </div>

              {/* Hide Pill on Session End Toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label
                    htmlFor="hide-pill-toggle"
                    className="text-sm font-medium text-text-primary cursor-pointer"
                  >
                    Hide Watching Pill on Session End
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically hide the watching pill when a monitoring session ends
                  </p>
                </div>

                {isPreferencesLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                ) : (
                  <Switch
                    id="hide-pill-toggle"
                    size="sm"
                    className="shrink-0"
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
                  />
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-border-subtle my-4" />

            {/* Summary Preferences */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-text-secondary" />
                <h3 className="text-lg font-semibold text-text-primary">Session Summary</h3>
              </div>

              {/* Always Ask at End of Session */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label
                    htmlFor="always-ask-toggle"
                    className="text-sm font-medium text-text-primary cursor-pointer"
                  >
                    Always ask for summary preferences
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Show the summary configuration dialog when ending a session
                  </p>
                </div>

                {isSummaryPrefsLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                ) : (
                  <Switch
                    id="always-ask-toggle"
                    size="sm"
                    className="shrink-0"
                    checked={alwaysAskOnSessionEnd}
                    onCheckedChange={async (checked) => {
                      const result = await setAlwaysAsk(checked);
                      if (result.success) {
                        toast({
                          title: "Preference saved",
                          description: checked
                            ? "You'll be asked for summary preferences when ending sessions"
                            : "Sessions will end using your default preferences below",
                        });
                      } else {
                        toast({
                          title: "Error",
                          description: "Failed to save preference",
                          variant: "destructive",
                        });
                      }
                    }}
                  />
                )}
              </div>

              {/* Default Summary Settings (shown when "always ask" is disabled) */}
              {!alwaysAskOnSessionEnd && (
                <div className="pl-4 border-l-2 border-border-subtle space-y-4 mt-2">
                  <p className="text-xs text-muted-foreground">
                    These defaults will be used when ending sessions:
                  </p>

                  {/* Default Detail Level */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium text-text-primary">Detail Level</Label>
                      <p className="text-xs text-muted-foreground">
                        {detailLevel === "concise" ? "Key highlights only" : "Full narrative"}
                      </p>
                    </div>

                    {isSummaryPrefsLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          variant={detailLevel === "concise" ? "default" : "outline"}
                          size="sm"
                          className="gap-1.5"
                          onClick={async () => {
                            const result = await updateDefaults({ detailLevel: "concise" });
                            if (result.success) {
                              toast({ title: "Default updated", description: "Concise summaries" });
                            }
                          }}
                        >
                          <Sparkles size={14} />
                          Concise
                        </Button>
                        <Button
                          variant={detailLevel === "verbose" ? "default" : "outline"}
                          size="sm"
                          className="gap-1.5"
                          onClick={async () => {
                            const result = await updateDefaults({ detailLevel: "verbose" });
                            if (result.success) {
                              toast({ title: "Default updated", description: "Verbose summaries" });
                            }
                          }}
                        >
                          <FileText size={14} />
                          Verbose
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Default Format */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium text-text-primary">Format</Label>
                      <p className="text-xs text-muted-foreground">
                        {format === "bullets" ? "Bullet points" : "Paragraphs"}
                      </p>
                    </div>

                    {isSummaryPrefsLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          variant={format === "bullets" ? "default" : "outline"}
                          size="sm"
                          className="gap-1.5"
                          onClick={async () => {
                            const result = await updateDefaults({ format: "bullets" });
                            if (result.success) {
                              toast({ title: "Default updated", description: "Bullet points" });
                            }
                          }}
                        >
                          <List size={14} />
                          Bullets
                        </Button>
                        <Button
                          variant={format === "paragraphs" ? "default" : "outline"}
                          size="sm"
                          className="gap-1.5"
                          onClick={async () => {
                            const result = await updateDefaults({ format: "paragraphs" });
                            if (result.success) {
                              toast({ title: "Default updated", description: "Paragraphs" });
                            }
                          }}
                        >
                          <FileText size={14} />
                          Paragraphs
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Include Screenshots */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label
                        htmlFor="include-screenshots-toggle"
                        className="text-sm font-medium text-text-primary cursor-pointer"
                      >
                        Include Screenshots
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Attach key visuals to session summaries
                      </p>
                    </div>

                    {isSummaryPrefsLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    ) : (
                      <Switch
                        id="include-screenshots-toggle"
                        size="sm"
                        className="shrink-0"
                        checked={includeScreenshots}
                        onCheckedChange={async (checked) => {
                          const result = await updateDefaults({ includeScreenshots: checked });
                          if (result.success) {
                            toast({
                              title: "Default updated",
                              description: checked
                                ? "Screenshots will be included"
                                : "Screenshots will not be included",
                            });
                          }
                        }}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Integrations Section */}
      <div className="space-y-4 max-w-2xl">
        <h2 className="text-2xl font-semibold text-text-primary">Integrations</h2>

        {/* Linear Integration Card */}
        <Card className="p-6 bg-background-elevated border-border-subtle">
          <div className="flex items-center gap-4">
            {/* Linear Icon */}
            <div className="w-12 h-12 bg-[#5E6AD2] rounded-lg flex items-center justify-center flex-shrink-0">
              <SiLinear className="w-6 h-6 text-white" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-text-primary">Linear</h3>
              <p className="text-sm text-muted-foreground">
                Connect your Linear account to send session updates to your tickets.
              </p>
            </div>

            {/* Action Button */}
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : linearStatus?.connected ? (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-sm text-status-success">
                  <Check className="w-4 h-4" />
                  Connected
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDisconnectLinear}
                  disabled={isDisconnecting}
                  className="text-muted-foreground hover:text-destructive"
                >
                  {isDisconnecting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Unlink className="w-4 h-4" />
                  )}
                </Button>
              </div>
            ) : (
              <Button
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
              </Button>
            )}
          </div>

          {linearStatus?.expired && (
            <div className="mt-4 p-3 rounded-lg bg-status-warning/10 border border-status-warning/20">
              <p className="text-sm text-status-warning">
                Your Linear connection has expired. Please reconnect to continue sending updates.
              </p>
            </div>
          )}
        </Card>

        {/* Notion Integration Card */}
        <Card className="p-6 bg-background-elevated border-border-subtle">
          <div className="flex items-center gap-4">
            {/* Notion Icon */}
            <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
              <SiNotion className="w-6 h-6 text-black" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-text-primary">Notion</h3>
              <p className="text-sm text-muted-foreground">
                Connect your Notion workspace to export documents.
              </p>
            </div>

            {/* Action Button */}
            {isNotionLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : notionStatus?.connected ? (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-sm text-status-success">
                  <Check className="w-4 h-4" />
                  Connected
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleConnectNotion}
                  disabled={isNotionConnecting}
                  className="text-muted-foreground hover:text-white border-border-subtle"
                >
                  {isNotionConnecting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Settings className="w-4 h-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDisconnectNotion}
                  disabled={isNotionDisconnecting}
                  className="text-muted-foreground hover:text-destructive"
                >
                  {isNotionDisconnecting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Unlink className="w-4 h-4" />
                  )}
                </Button>
              </div>
            ) : (
              <Button
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
              </Button>
            )}
          </div>

          {notionStatus?.expired && (
            <div className="mt-4 p-3 rounded-lg bg-status-warning/10 border border-status-warning/20">
              <p className="text-sm text-status-warning">
                Your Notion connection has expired. Please reconnect to continue exporting
                documents.
              </p>
            </div>
          )}
        </Card>

        {/* Gmail Integration Card */}
        <Card className="p-6 bg-background-elevated border-border-subtle">
          <div className="flex items-center gap-4">
            {/* Gmail Icon */}
            <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
              <SiGmail className="w-6 h-6 text-[#EA4335]" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-text-primary">Gmail</h3>
              <p className="text-sm text-muted-foreground">
                Connect your Gmail to send session summaries from your email.
              </p>
              {gmailStatus?.connected && gmailStatus.email && (
                <p className="text-xs text-muted-foreground mt-1">{gmailStatus.email}</p>
              )}
            </div>

            {/* Action Button */}
            {isGmailLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : gmailStatus?.connected ? (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-sm text-status-success">
                  <Check className="w-4 h-4" />
                  Connected
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDisconnectGmail}
                  disabled={isGmailDisconnecting}
                  className="text-muted-foreground hover:text-destructive"
                >
                  {isGmailDisconnecting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Unlink className="w-4 h-4" />
                  )}
                </Button>
              </div>
            ) : (
              <Button
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
              </Button>
            )}
          </div>

          {gmailStatus?.expired && (
            <div className="mt-4 p-3 rounded-lg bg-status-warning/10 border border-status-warning/20">
              <p className="text-sm text-status-warning">
                Your Gmail connection has expired. Please reconnect to continue sending emails.
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* About Section */}
      <div className="space-y-4 max-w-2xl">
        <h2 className="text-2xl font-semibold text-text-primary">About</h2>
        <Card className="p-6 bg-background-elevated border-border-subtle">
          <div className="flex items-center gap-4">
            {/* App Icon */}
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <Info className="w-6 h-6 text-primary" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-text-primary">Mitable</h3>
              <p className="text-sm text-muted-foreground">Version {appVersion || "..."}</p>
            </div>

            {/* Update Button - changes based on state */}
            <Button
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
                  <Check className="w-4 h-4 text-status-success" />
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
            </Button>
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
              <p className="text-xs text-muted-foreground">
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
      </div>
    </div>
  );
}
