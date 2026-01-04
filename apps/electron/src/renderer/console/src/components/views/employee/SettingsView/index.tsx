/**
 * SettingsView
 *
 * User settings page with Linear integration connection.
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { authService } from "@/console/src/services/authService";
import { usePreferences } from "@/console/src/hooks/usePreferences";
import { Loader2, Check, Link2, Unlink, Mail, Settings } from "lucide-react";
import { SiLinear, SiGmail } from "react-icons/si";
import { BillingSection } from "@/console/src/components/billing";

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

export default function SettingsView() {
  const { toast } = useToast();
  const [linearStatus, setLinearStatus] = useState<LinearStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // Gmail state
  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
  const [isGmailLoading, setIsGmailLoading] = useState(true);
  const [isGmailConnecting, setIsGmailConnecting] = useState(false);
  const [isGmailDisconnecting, setIsGmailDisconnecting] = useState(false);

  // Preferences
  const {
    hidePillOnSessionEnd,
    showPillOnSessionStart,
    isLoading: isPreferencesLoading,
    updatePreference,
  } = usePreferences();

  useEffect(() => {
    loadLinearStatus();
    loadGmailStatus();
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
      console.error("Error loading Linear status:", error);
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
      console.error("Error loading Gmail status:", error);
    } finally {
      setIsGmailLoading(false);
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
          console.error("Polling error:", err);
        }
      }, 2000);

      // Stop polling after 2 minutes
      setTimeout(() => clearInterval(pollInterval), 120000);
    } catch (error) {
      console.error("Error connecting Linear:", error);
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
      console.error("Error disconnecting Linear:", error);
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
          console.error("Polling error:", err);
        }
      }, 2000);

      // Stop polling after 2 minutes
      setTimeout(() => clearInterval(pollInterval), 120000);
    } catch (error) {
      console.error("Error connecting Gmail:", error);
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
      console.error("Error disconnecting Gmail:", error);
      toast({
        title: "Error",
        description: "Failed to disconnect Gmail. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGmailDisconnecting(false);
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-4xl font-bold text-white">Settings</h1>
        <p className="text-text-secondary mt-2">Manage your account and integrations</p>
      </div>

      {/* Subscription Section */}
      <div className="space-y-4 max-w-2xl">
        <h2 className="text-2xl font-semibold text-white">Subscription</h2>
        <BillingSection />
      </div>

      {/* Preferences Section */}
      <div className="space-y-4 max-w-2xl">
        <h2 className="text-2xl font-semibold text-white">Preferences</h2>
        <Card className="p-6 bg-background-elevated border-border-subtle">
          <div className="space-y-6">
            {/* Session Preferences */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Settings size={18} className="text-text-secondary" />
                <h3 className="text-lg font-semibold text-white">Session</h3>
              </div>

              {/* Show Pill on Session Start Toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label
                    htmlFor="show-pill-toggle"
                    className="text-sm font-medium text-white cursor-pointer"
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
                    className="text-sm font-medium text-white cursor-pointer"
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
          </div>
        </Card>
      </div>

      {/* Integrations Section */}
      <div className="space-y-4 max-w-2xl">
        <h2 className="text-2xl font-semibold text-white">Integrations</h2>

        {/* Linear Integration Card */}
        <Card className="p-6 bg-background-elevated border-border-subtle">
          <div className="flex items-center gap-4">
            {/* Linear Icon */}
            <div className="w-12 h-12 bg-[#5E6AD2] rounded-lg flex items-center justify-center flex-shrink-0">
              <SiLinear className="w-6 h-6 text-white" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-white">Linear</h3>
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

        {/* Gmail Integration Card */}
        <Card className="p-6 bg-background-elevated border-border-subtle">
          <div className="flex items-center gap-4">
            {/* Gmail Icon */}
            <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
              <SiGmail className="w-6 h-6 text-[#EA4335]" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-white">Gmail</h3>
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
    </div>
  );
}
