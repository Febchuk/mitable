import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  useMemo,
  FormEvent,
} from "react";
import { useTheme } from "../../hooks/useTheme";
import { authService } from "../../services/authService";
import { useUser } from "../../context/UserContext";
import { useToast } from "@/hooks/use-toast";
import { usePreferences } from "@/console/src/hooks/usePreferences";
import { usePermissions } from "../../hooks/usePermissions";
import { useSubscription } from "@/console/src/hooks/queries/billing";
import { createLogger } from "../../../../lib/logger";
import { API_BASE_URL } from "../../lib/config";
import { apiRequest } from "../../services/api";
import {
  LinearStatus,
  GmailStatus,
  NotionStatus,
  GranolaStatus,
  FirefliesStatus,
  SlackUserStatus,
  formatPlanDisplay,
} from "./helpers";

const logger = createLogger("useSettingsState");

export function useSettingsState() {
  const { user, organization } = useUser();
  const { toast } = useToast();
  const {
    data: subscriptionData,
    isPending: isPlanPending,
    isError: isPlanError,
  } = useSubscription();

  const planLabel = useMemo(
    () => formatPlanDisplay(subscriptionData, isPlanPending, isPlanError),
    [subscriptionData, isPlanPending, isPlanError]
  );
  const { theme: currentTheme, setTheme } = useTheme();

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // @deprecated — integration state, scheduled for removal
  const [linearStatus, setLinearStatus] = useState<LinearStatus | null>(null);
  const [isLinearLoading, setIsLinearLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // @deprecated — integration state, scheduled for removal
  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
  const [isGmailLoading, setIsGmailLoading] = useState(true);
  const [isGmailConnecting, setIsGmailConnecting] = useState(false);
  const [isGmailDisconnecting, setIsGmailDisconnecting] = useState(false);

  // @deprecated — integration state, scheduled for removal
  const [notionStatus, setNotionStatus] = useState<NotionStatus | null>(null);
  const [isNotionLoading, setIsNotionLoading] = useState(true);
  const [isNotionConnecting, setIsNotionConnecting] = useState(false);
  const [isNotionDisconnecting, setIsNotionDisconnecting] = useState(false);

  // @deprecated — integration state, scheduled for removal
  const [granolaStatus, setGranolaStatus] = useState<GranolaStatus | null>(null);
  const [isGranolaLoading, setIsGranolaLoading] = useState(true);
  const [isGranolaConnecting, setIsGranolaConnecting] = useState(false);
  const [isGranolaDisconnecting, setIsGranolaDisconnecting] = useState(false);

  // @deprecated — integration state, scheduled for removal
  const [firefliesStatus, setFirefliesStatus] = useState<FirefliesStatus | null>(null);
  const [isFirefliesLoading, setIsFirefliesLoading] = useState(true);
  const [isFirefliesConnecting, setIsFirefliesConnecting] = useState(false);
  const [isFirefliesDisconnecting, setIsFirefliesDisconnecting] = useState(false);
  const [showFirefliesModal, setShowFirefliesModal] = useState(false);
  const [firefliesApiKey, setFirefliesApiKey] = useState("");

  // @deprecated — integration state, scheduled for removal
  const [slackUserStatus, setSlackUserStatus] = useState<SlackUserStatus | null>(null);
  const [isSlackUserLoading, setIsSlackUserLoading] = useState(true);
  const [isSlackUserConnecting, setIsSlackUserConnecting] = useState(false);
  const [isSlackUserDisconnecting, setIsSlackUserDisconnecting] = useState(false);

  // API Keys state
  const [apiKeys, setApiKeys] = useState<
    Array<{
      id: string;
      name: string;
      keyPrefix: string;
      lastUsedAt: string | null;
      createdAt: string;
      revokedAt: string | null;
    }>
  >([]);
  const [isApiKeysLoading, setIsApiKeysLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState("");
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);

  // About / Version state
  const [appVersion, setAppVersion] = useState<string>("");
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<
    "idle" | "checking" | "up-to-date" | "downloaded" | "error"
  >("idle");
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [downloadedVersion, setDownloadedVersion] = useState<string | null>(null);

  // Preferences hook
  const {
    showPillOnSessionStart,
    hidePillOnSessionEnd,
    isLoading: isPreferencesLoading,
    updatePreference,
  } = usePreferences();

  // Permissions hook
  const {
    screen: screenPermission,
    accessibility: accessibilityPermission,
    requestAccessibility,
    openScreenRecording,
  } = usePermissions();

  // Block list state
  const [blockedApps, setBlockedApps] = useState<string[]>([]);
  const [detectedApps, setDetectedApps] = useState<
    Array<{
      normalizedName: string;
      originalName: string;
      source: "detected" | "installed" | "both";
      iconDataUrl?: string;
    }>
  >([]);
  const [isBlockListLoading, setIsBlockListLoading] = useState(true);
  const [isRefreshingApps, setIsRefreshingApps] = useState(false);
  const [appSearchQuery, setAppSearchQuery] = useState("");

  // Notification frequency state
  const [notificationFrequency, setNotificationFrequency] = useState<number>(30);
  const [isNotificationFrequencyLoading, setIsNotificationFrequencyLoading] = useState(true);

  // Passive monitoring state
  const [passiveMonitoring, setPassiveMonitoring] = useState<boolean>(false);
  const [isPassiveMonitoringLoading, setIsPassiveMonitoringLoading] = useState(true);

  // Auto recap state
  const [autoRecap, setAutoRecap] = useState<boolean>(false);
  const [isAutoRecapLoading, setIsAutoRecapLoading] = useState(true);

  // Pill display mode state
  const [pillDisplayMode, setPillDisplayMode] = useState<"compact" | "expanded">("compact");
  const [isPillDisplayModeLoading, setIsPillDisplayModeLoading] = useState(true);

  // Audio preferences state
  const [audioDevices, setAudioDevices] = useState<
    Array<{ deviceId: string; label: string; groupId: string }>
  >([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<
    Array<{ deviceId: string; label: string; groupId: string }>
  >([]);
  const [selectedMicId, setSelectedMicId] = useState<string | null>(null);
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null);
  const [systemAudioEnabled, setSystemAudioEnabled] = useState<boolean>(true);
  const [isAudioPrefsLoading, setIsAudioPrefsLoading] = useState(true);
  const [isMicTesting, setIsMicTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);

  // @deprecated — integration state, scheduled for removal
  const linearPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const gmailPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const notionPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const granolaPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const slackUserPollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // @deprecated — integration state, scheduled for removal
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
      if (granolaPollIntervalRef.current) {
        clearInterval(granolaPollIntervalRef.current);
      }
      if (slackUserPollIntervalRef.current) {
        clearInterval(slackUserPollIntervalRef.current);
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

  const loadAllBlockableApps = useCallback(async (forceRefresh = false) => {
    try {
      if (forceRefresh) {
        setIsRefreshingApps(true);
      }
      const result = await window.consoleAPI.getAllBlockableApps(forceRefresh);
      if (result.success) {
        setDetectedApps(result.apps);
      } else {
        logger.error("Error loading blockable apps:", result.error);
        const detectedResult = await window.consoleAPI.getDetectedApps();
        setDetectedApps(
          detectedResult.map((app) => ({
            ...app,
            source: "detected" as const,
          }))
        );
      }
    } catch (error) {
      logger.error("Error loading blockable apps:", error);
    } finally {
      if (forceRefresh) {
        setIsRefreshingApps(false);
      }
    }
  }, []);

  const handleRefreshAppList = async () => {
    setIsRefreshingApps(true);
    try {
      const result = await window.consoleAPI.refreshInstalledApps();
      if (result.success) {
        setDetectedApps(result.apps);
        toast({
          title: "App list refreshed",
          description: `Found ${result.apps.length} apps on your system.`,
        });
      } else {
        toast({
          title: "Refresh failed",
          description: result.error || "Failed to refresh app list.",
          variant: "destructive",
        });
      }
    } catch (error) {
      logger.error("Error refreshing app list:", error);
      toast({
        title: "Refresh failed",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshingApps(false);
    }
  };

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

  // Passive monitoring functions
  const loadPassiveMonitoring = useCallback(async () => {
    try {
      setIsPassiveMonitoringLoading(true);
      const state = await window.consoleAPI?.getPassiveMonitoringState?.();
      setPassiveMonitoring(state?.state !== "disabled");
    } catch (error) {
      logger.error("Error loading passive monitoring state:", error);
    } finally {
      setIsPassiveMonitoringLoading(false);
    }
  }, []);

  const handlePassiveMonitoringChange = async (enabled: boolean) => {
    try {
      const result = await window.consoleAPI?.setPassiveMonitoringEnabled?.(enabled);
      if (result?.success) {
        setPassiveMonitoring(enabled);
        toast({
          title: "Preference saved",
          description: enabled
            ? "Sessions will automatically start when activity is detected."
            : "Passive monitoring disabled.",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to save passive monitoring preference.",
          variant: "destructive",
        });
      }
    } catch (error) {
      logger.error("Error setting passive monitoring:", error);
      toast({
        title: "Error",
        description: "Failed to save passive monitoring preference.",
        variant: "destructive",
      });
    }
  };

  // Auto recap functions
  const loadAutoRecap = useCallback(async () => {
    if (!user?.id) return;
    try {
      setIsAutoRecapLoading(true);
      const enabled = await window.consoleAPI.getAutoRecap(user.id);
      setAutoRecap(enabled);
    } catch (error) {
      logger.error("Error loading auto recap:", error);
    } finally {
      setIsAutoRecapLoading(false);
    }
  }, [user?.id]);

  const handleAutoRecapChange = async (enabled: boolean) => {
    if (!user?.id) return;
    try {
      const result = await window.consoleAPI.setAutoRecap(user.id, enabled);
      if (result.success) {
        setAutoRecap(enabled);
        toast({
          title: "Preference saved",
          description: enabled
            ? "Recaps will be automatically generated when sessions end."
            : "Auto recap disabled. You can still create recaps manually.",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to save auto recap preference.",
          variant: "destructive",
        });
      }
    } catch (error) {
      logger.error("Error setting auto recap:", error);
      toast({
        title: "Error",
        description: "Failed to save auto recap preference.",
        variant: "destructive",
      });
    }
  };

  // Pill display mode functions
  const loadPillDisplayMode = useCallback(async () => {
    if (!user?.id) return;
    try {
      setIsPillDisplayModeLoading(true);
      const mode = await window.consoleAPI.getPillDisplayMode(user.id);
      setPillDisplayMode(mode);
    } catch (error) {
      logger.error("Error loading pill display mode:", error);
    } finally {
      setIsPillDisplayModeLoading(false);
    }
  }, [user?.id]);

  const handlePillDisplayModeChange = async (mode: "compact" | "expanded") => {
    if (!user?.id) return;
    try {
      const result = await window.consoleAPI.setPillDisplayMode(user.id, mode);
      if (result.success) {
        setPillDisplayMode(mode);
        toast({
          title: "Preference saved",
          description:
            mode === "expanded"
              ? "Watching pill will always show all controls."
              : "Watching pill will be compact and expand on hover.",
        });
      }
    } catch (error) {
      logger.error("Error setting pill display mode:", error);
      toast({
        title: "Error",
        description: "Failed to save pill display mode.",
        variant: "destructive",
      });
    }
  };

  // Audio preferences functions
  const loadAudioPreferences = useCallback(async () => {
    try {
      setIsAudioPrefsLoading(true);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        const devices = await navigator.mediaDevices.enumerateDevices();

        const audioInputs = devices
          .filter((device) => device.kind === "audioinput")
          .map((device) => ({
            deviceId: device.deviceId,
            label: device.label || `Microphone ${device.deviceId.slice(0, 8)}`,
            groupId: device.groupId || "",
          }));

        const audioOutputs = devices
          .filter((device) => device.kind === "audiooutput")
          .map((device) => ({
            deviceId: device.deviceId,
            label: device.label || `Speaker ${device.deviceId.slice(0, 8)}`,
            groupId: device.groupId || "",
          }));

        stream.getTracks().forEach((track) => track.stop());

        setAudioDevices(audioInputs);
        setAudioOutputDevices(audioOutputs);
        logger.info(`Found ${audioInputs.length} microphones and ${audioOutputs.length} speakers`);
      } catch (error) {
        logger.error("Failed to enumerate audio devices:", error);
        setAudioDevices([]);
        setAudioOutputDevices([]);
      }

      const prefs = await window.consoleAPI.getAudioPreferences();
      setSelectedMicId(prefs.microphoneDeviceId);
      setSelectedOutputId(prefs.systemAudioOutputId || null);
      setSystemAudioEnabled(prefs.systemAudioEnabled);
    } catch (error) {
      logger.error("Error loading audio preferences:", error);
    } finally {
      setIsAudioPrefsLoading(false);
    }
  }, []);

  const handleMicrophoneChange = async (deviceId: string) => {
    try {
      const result = await window.consoleAPI.setAudioPreferences({
        microphoneDeviceId: deviceId === "default" ? null : deviceId,
      });

      if (result.success) {
        setSelectedMicId(deviceId === "default" ? null : deviceId);
        toast({
          title: "Microphone updated",
          description: "Your microphone preference has been saved",
        });
      }
    } catch (error) {
      logger.error("Error setting microphone:", error);
      toast({
        title: "Error",
        description: "Failed to save microphone preference",
        variant: "destructive",
      });
    }
  };

  const handleSystemAudioToggle = async (enabled: boolean) => {
    try {
      const result = await window.consoleAPI.setAudioPreferences({
        systemAudioEnabled: enabled,
      });

      if (result.success) {
        setSystemAudioEnabled(enabled);
        toast({
          title: "System audio updated",
          description: enabled
            ? "System audio will be captured during recordings"
            : "Only microphone will be captured during recordings",
        });
      }
    } catch (error) {
      logger.error("Error setting system audio:", error);
      toast({
        title: "Error",
        description: "Failed to save system audio preference",
        variant: "destructive",
      });
    }
  };

  const handleOutputDeviceChange = async (deviceId: string) => {
    try {
      const result = await window.consoleAPI.setAudioPreferences({
        systemAudioOutputId: deviceId === "default" ? null : deviceId,
      });

      if (result.success) {
        setSelectedOutputId(deviceId === "default" ? null : deviceId);
        const deviceLabel =
          deviceId === "default"
            ? "System Default"
            : audioOutputDevices.find((d) => d.deviceId === deviceId)?.label || "Unknown";
        toast({
          title: "Output device updated",
          description: `System audio will be captured from: ${deviceLabel}`,
        });
      }
    } catch (error) {
      logger.error("Error setting output device:", error);
      toast({
        title: "Error",
        description: "Failed to save output device preference",
        variant: "destructive",
      });
    }
  };

  // Mic test functionality
  const testMicrophoneRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const startMicTest = async () => {
    try {
      setIsMicTesting(true);

      const constraints: MediaStreamConstraints = {
        audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true,
      };

      logger.info("Starting mic test with constraints:", constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      testMicrophoneRef.current = stream;

      const tracks = stream.getAudioTracks();
      if (tracks.length > 0) {
        logger.info("Using microphone:", tracks[0].label, "ID:", tracks[0].id);
      }

      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.3;
      microphone.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.fftSize);
      let frameCount = 0;
      const updateLevel = () => {
        if (!analyserRef.current) return;

        analyserRef.current.getByteTimeDomainData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);

        const deviation = Math.abs(rms - 128);
        const level = Math.min(100, Math.round((deviation / 128) * 100 * 25));

        frameCount++;
        if (frameCount % 30 === 0) {
          console.log("🎤 Audio Debug:", {
            firstFewBytes: Array.from(dataArray.slice(0, 10)),
            rms: rms.toFixed(2),
            deviation: deviation.toFixed(2),
            level,
            min: Math.min(...dataArray),
            max: Math.max(...dataArray),
            average: (dataArray.reduce((a, b) => a + b, 0) / dataArray.length).toFixed(2),
          });
        }

        setMicLevel(level);
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
      logger.info("Mic test started successfully");
    } catch (error) {
      logger.error("Failed to start mic test:", error);
      toast({
        title: "Mic test failed",
        description: "Could not access microphone. Check permissions.",
        variant: "destructive",
      });
      setIsMicTesting(false);
    }
  };

  const stopMicTest = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (testMicrophoneRef.current) {
      testMicrophoneRef.current.getTracks().forEach((track) => track.stop());
      testMicrophoneRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    setIsMicTesting(false);
    setMicLevel(0);
  };

  // Cleanup mic test on unmount
  useEffect(() => {
    return () => {
      if (isMicTesting) {
        stopMicTest();
      }
    };
  }, [isMicTesting]);

  // Force scroll to top before any render
  useLayoutEffect(() => {
    const scrollableElement = document.querySelector(".overflow-y-auto");
    if (scrollableElement) {
      scrollableElement.scrollTop = 0;
    }
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  useEffect(() => {
    loadLinearStatus();
    loadGmailStatus();
    loadNotionStatus();
    loadGranolaStatus();
    loadFirefliesStatus();
    loadSlackUserStatus();
    loadAppVersion();
    loadAudioPreferences();
    if (user?.id) {
      loadBlockList();
      loadAllBlockableApps();
      loadNotificationFrequency();
      loadPassiveMonitoring();
      loadAutoRecap();
      loadPillDisplayMode();
    }
  }, [
    user?.id,
    loadBlockList,
    loadAllBlockableApps,
    loadNotificationFrequency,
    loadPassiveMonitoring,
    loadAutoRecap,
    loadPillDisplayMode,
    loadAudioPreferences,
  ]);

  // Listen for update events (download happens silently in background)
  useEffect(() => {
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
    });

    const unsubscribeDownloaded = window.consoleAPI?.onUpdateDownloaded((info) => {
      logger.info("Update downloaded, ready to install:", info.version);
      setIsCheckingForUpdates(false);
      setUpdateStatus("downloaded");
      setDownloadedVersion(info.version);
    });

    return () => {
      unsubscribeNotAvailable?.();
      unsubscribeError?.();
      unsubscribeDownloaded?.();
    };
  }, []);

  // @deprecated — integration handler, scheduled for removal
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

  // @deprecated — integration handler, scheduled for removal
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

  // @deprecated — integration handler, scheduled for removal
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

  const handleInstallUpdate = () => {
    try {
      window.consoleAPI?.installUpdate();
    } catch (error) {
      logger.error("Error installing update:", error);
      setUpdateStatus("error");
      setUpdateError("Failed to install update");
    }
  };

  // @deprecated — integration handler, scheduled for removal
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

  // @deprecated — integration handler, scheduled for removal
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

  // @deprecated — integration handler, scheduled for removal
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

  // @deprecated — integration handler, scheduled for removal
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

  // @deprecated — integration handler, scheduled for removal
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

  // @deprecated — integration handler, scheduled for removal
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

  // @deprecated — integration handler, scheduled for removal
  const loadGranolaStatus = async () => {
    setIsGranolaLoading(true);
    try {
      const token = authService.getAccessToken();
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/api/integrations/granola/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setGranolaStatus(data);
      }
    } catch (error) {
      logger.error("Error loading Granola status:", error);
    } finally {
      setIsGranolaLoading(false);
    }
  };

  // @deprecated — integration handler, scheduled for removal
  const handleConnectGranola = async () => {
    setIsGranolaConnecting(true);
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

      const response = await fetch(`${API_BASE_URL}/api/integrations/granola/oauth/start`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to start Granola OAuth");
      }

      const { authUrl } = await response.json();
      window.open(authUrl, "_blank");

      toast({
        title: "Complete in Browser",
        description: "Please complete the Granola authorization in your browser, then return here.",
      });

      const pollInterval = setInterval(async () => {
        try {
          const token = authService.getAccessToken();
          if (!token) return;

          const resp = await fetch(`${API_BASE_URL}/api/integrations/granola/status`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (resp.ok) {
            const data = await resp.json();
            setGranolaStatus(data);
            if (data.connected) {
              clearInterval(pollInterval);
              granolaPollIntervalRef.current = null;
              toast({
                title: "Granola Connected",
                description: "Your Granola account has been connected successfully!",
              });
            }
          }
        } catch (err) {
          logger.error("Polling error:", err);
        }
      }, 2000);

      granolaPollIntervalRef.current = pollInterval;
      setTimeout(() => {
        clearInterval(pollInterval);
        granolaPollIntervalRef.current = null;
      }, 120000);
    } catch (error) {
      logger.error("Error connecting Granola:", error);
      toast({
        title: "Connection Failed",
        description: "Failed to connect to Granola. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGranolaConnecting(false);
    }
  };

  // @deprecated — integration handler, scheduled for removal
  const handleDisconnectGranola = async () => {
    setIsGranolaDisconnecting(true);
    try {
      const token = authService.getAccessToken();
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/api/integrations/granola/disconnect`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        setGranolaStatus({ connected: false, expired: false, email: null, lastSyncedAt: null });
        toast({
          title: "Granola Disconnected",
          description: "Your Granola account has been disconnected.",
        });
      }
    } catch (error) {
      logger.error("Error disconnecting Granola:", error);
      toast({
        title: "Error",
        description: "Failed to disconnect Granola. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGranolaDisconnecting(false);
    }
  };

  // @deprecated — integration handler, scheduled for removal
  const loadFirefliesStatus = async () => {
    setIsFirefliesLoading(true);
    try {
      const token = authService.getAccessToken();
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/api/integrations/fireflies/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setFirefliesStatus(data);
      }
    } catch (error) {
      logger.error("Error loading Fireflies status:", error);
    } finally {
      setIsFirefliesLoading(false);
    }
  };

  // @deprecated — integration handler, scheduled for removal
  const handleConnectFireflies = async () => {
    setIsFirefliesConnecting(true);
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

      const response = await fetch(`${API_BASE_URL}/api/integrations/fireflies/connect`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ apiKey: firefliesApiKey.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to connect Fireflies");
      }

      setFirefliesStatus({ connected: true, lastSyncedAt: null });
      setShowFirefliesModal(false);
      setFirefliesApiKey("");
      toast({
        title: "Fireflies Connected",
        description: `Connected as ${data.email || data.name || "your account"}. Meetings will sync automatically.`,
      });
    } catch (error) {
      logger.error("Error connecting Fireflies:", error);
      toast({
        title: "Connection Failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to connect Fireflies. Check your API key.",
        variant: "destructive",
      });
    } finally {
      setIsFirefliesConnecting(false);
    }
  };

  // @deprecated — integration handler, scheduled for removal
  const handleDisconnectFireflies = async () => {
    setIsFirefliesDisconnecting(true);
    try {
      const token = authService.getAccessToken();
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/api/integrations/fireflies/disconnect`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        setFirefliesStatus({ connected: false, lastSyncedAt: null });
        toast({
          title: "Fireflies Disconnected",
          description: "Your Fireflies account has been disconnected.",
        });
      }
    } catch (error) {
      logger.error("Error disconnecting Fireflies:", error);
      toast({
        title: "Error",
        description: "Failed to disconnect Fireflies. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsFirefliesDisconnecting(false);
    }
  };

  // @deprecated — integration handler, scheduled for removal
  const loadSlackUserStatus = async () => {
    setIsSlackUserLoading(true);
    try {
      const token = authService.getAccessToken();
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/api/integrations/slack/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setSlackUserStatus(data);
      }
    } catch (error) {
      logger.error("Error loading Slack user status:", error);
    } finally {
      setIsSlackUserLoading(false);
    }
  };

  // @deprecated — integration handler, scheduled for removal
  const handleConnectSlackUser = async () => {
    setIsSlackUserConnecting(true);
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

      const response = await fetch(`${API_BASE_URL}/api/integrations/slack/oauth/start`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to start Slack OAuth");
      }

      const { authUrl } = await response.json();
      window.open(authUrl, "_blank");

      toast({
        title: "Complete in Browser",
        description: "Please complete the Slack authorization in your browser, then return here.",
      });

      const pollInterval = setInterval(async () => {
        try {
          const token = authService.getAccessToken();
          if (!token) return;

          const resp = await fetch(`${API_BASE_URL}/api/integrations/slack/status`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (resp.ok) {
            const data = await resp.json();
            setSlackUserStatus(data);
            if (data.connected) {
              clearInterval(pollInterval);
              slackUserPollIntervalRef.current = null;
              toast({
                title: "Slack Connected",
                description: `Your Slack account${data.teamName ? ` (${data.teamName})` : ""} has been connected.`,
              });
            }
          }
        } catch (err) {
          logger.error("Polling error:", err);
        }
      }, 2000);

      slackUserPollIntervalRef.current = pollInterval;
      setTimeout(() => {
        clearInterval(pollInterval);
        slackUserPollIntervalRef.current = null;
      }, 120000);
    } catch (error) {
      logger.error("Error connecting Slack:", error);
      toast({
        title: "Connection Failed",
        description: "Failed to connect to Slack. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSlackUserConnecting(false);
    }
  };

  // @deprecated — integration handler, scheduled for removal
  const handleDisconnectSlackUser = async () => {
    setIsSlackUserDisconnecting(true);
    try {
      const token = authService.getAccessToken();
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/api/integrations/slack/disconnect`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        setSlackUserStatus({
          connected: false,
          expired: false,
          slackUserId: null,
          teamName: null,
          displayName: null,
        });
        toast({
          title: "Slack Disconnected",
          description: "Your Slack account has been disconnected.",
        });
      }
    } catch (error) {
      logger.error("Error disconnecting Slack:", error);
      toast({
        title: "Error",
        description: "Failed to disconnect Slack. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSlackUserDisconnecting(false);
    }
  };

  /** @deprecated Backend API keys removed — BYOK keys stored locally via keyVault */
  const loadApiKeys = useCallback(async () => {
    setIsApiKeysLoading(false);
  }, []);

  const handleCreateApiKey = async () => {
    if (!newKeyName.trim()) return;
    setIsCreatingKey(true);
    try {
      const result = await apiRequest<{ id: string; key: string; keyPrefix: string }>("/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      setNewlyCreatedKey(result.key);
      setNewKeyName("");
      await loadApiKeys();
      toast({
        title: "API Key Created",
        description: "Copy your key now — it won't be shown again.",
      });
    } catch (error) {
      logger.error("Error creating API key:", error);
      toast({ title: "Error", description: "Failed to create API key.", variant: "destructive" });
    } finally {
      setIsCreatingKey(false);
    }
  };

  const handleRevokeApiKey = async (id: string) => {
    setRevokingKeyId(id);
    try {
      await apiRequest(`/api-keys/${id}`, { method: "DELETE" });
      setApiKeys((prev) => prev.filter((k) => k.id !== id));
      toast({ title: "API Key Revoked" });
    } catch (error) {
      logger.error("Error revoking API key:", error);
      toast({ title: "Error", description: "Failed to revoke API key.", variant: "destructive" });
    } finally {
      setRevokingKeyId(null);
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

  const requirements = [
    { label: "At least 8 characters", test: (pw: string) => pw.length >= 8 },
    { label: "Contains uppercase letter", test: (pw: string) => /[A-Z]/.test(pw) },
    { label: "Contains lowercase letter", test: (pw: string) => /[a-z]/.test(pw) },
    { label: "Contains number", test: (pw: string) => /[0-9]/.test(pw) },
  ];

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure your new passwords match",
        variant: "destructive",
      });
      return;
    }

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
      if (user?.isLocalAccount && window.consoleAPI?.localAuthResetPassword && user.email) {
        const result = await window.consoleAPI.localAuthResetPassword(
          user.email,
          currentPassword,
          newPassword
        );
        if (!result.success) throw new Error(result.error || "Password change failed");
      } else {
        await authService.changePassword(currentPassword, newPassword);
      }

      toast({
        title: "Password changed successfully",
        description: "Your password has been updated",
      });

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

  return {
    // Context
    user,
    organization,
    toast,

    // Subscription / plan
    subscriptionData,
    isPlanPending,
    isPlanError,
    planLabel,

    // Theme
    currentTheme,
    setTheme,

    // Password change
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    showCurrentPassword,
    setShowCurrentPassword,
    showNewPassword,
    setShowNewPassword,
    showConfirmPassword,
    setShowConfirmPassword,
    isChangingPassword,
    passwordStrength,
    strengthColors,
    strengthWidth,
    requirements,
    handlePasswordChange,

    // @deprecated — integration state, scheduled for removal
    linearStatus,
    isLinearLoading,
    isConnecting,
    isDisconnecting,
    gmailStatus,
    isGmailLoading,
    isGmailConnecting,
    isGmailDisconnecting,
    notionStatus,
    isNotionLoading,
    isNotionConnecting,
    isNotionDisconnecting,
    granolaStatus,
    isGranolaLoading,
    isGranolaConnecting,
    isGranolaDisconnecting,
    firefliesStatus,
    isFirefliesLoading,
    isFirefliesConnecting,
    isFirefliesDisconnecting,
    showFirefliesModal,
    setShowFirefliesModal,
    firefliesApiKey,
    setFirefliesApiKey,
    slackUserStatus,
    isSlackUserLoading,
    isSlackUserConnecting,
    isSlackUserDisconnecting,

    // @deprecated — integration handlers, scheduled for removal
    handleConnectLinear,
    handleDisconnectLinear,
    handleConnectGmail,
    handleDisconnectGmail,
    handleConnectNotion,
    handleDisconnectNotion,
    handleConnectGranola,
    handleDisconnectGranola,
    handleConnectFireflies,
    handleDisconnectFireflies,
    handleConnectSlackUser,
    handleDisconnectSlackUser,

    // API Keys
    apiKeys,
    isApiKeysLoading,
    newKeyName,
    setNewKeyName,
    isCreatingKey,
    newlyCreatedKey,
    setNewlyCreatedKey,
    revokingKeyId,
    handleCreateApiKey,
    handleRevokeApiKey,

    // About / Version / Updates
    appVersion,
    isCheckingForUpdates,
    updateStatus,
    updateError,
    downloadedVersion,
    handleCheckForUpdates,
    handleInstallUpdate,

    // Preferences
    showPillOnSessionStart,
    hidePillOnSessionEnd,
    isPreferencesLoading,
    updatePreference,

    // Permissions
    screenPermission,
    accessibilityPermission,
    requestAccessibility,
    openScreenRecording,

    // Block list
    blockedApps,
    detectedApps,
    isBlockListLoading,
    isRefreshingApps,
    appSearchQuery,
    setAppSearchQuery,
    cleanAppName,
    handleRefreshAppList,
    handleAddBlockedApp,
    handleRemoveBlockedApp,

    // Notification frequency
    notificationFrequency,
    isNotificationFrequencyLoading,
    handleNotificationFrequencyChange,

    // Passive monitoring
    passiveMonitoring,
    isPassiveMonitoringLoading,
    handlePassiveMonitoringChange,

    // Auto recap
    autoRecap,
    isAutoRecapLoading,
    handleAutoRecapChange,

    // Pill display mode
    pillDisplayMode,
    isPillDisplayModeLoading,
    handlePillDisplayModeChange,

    // Audio preferences
    audioDevices,
    audioOutputDevices,
    selectedMicId,
    selectedOutputId,
    systemAudioEnabled,
    isAudioPrefsLoading,
    isMicTesting,
    micLevel,
    handleMicrophoneChange,
    handleSystemAudioToggle,
    handleOutputDeviceChange,
    startMicTest,
    stopMicTest,
  };
}
