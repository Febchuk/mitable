import { useState, FormEvent, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
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
  RefreshCw,
  ExternalLink,
  Download,
  Settings,
  Shield,
  Plus,
  Search,
  Globe,
} from "lucide-react";
import { SiLinear, SiGmail, SiNotion } from "react-icons/si";
import { FirefliesIcon } from "../../../components/icons/integrations";
import MitableIcon from "../components/icons/MitableIcon";
import { Button as ShadcnButton } from "@/components/ui/button";
import { authService } from "../services/authService";
import { useUser } from "../context/UserContext";
import { useToast } from "@/hooks/use-toast";
import { BillingSection } from "@/console/src/components/billing";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { usePreferences } from "@/console/src/hooks/usePreferences";
import {
  useOrganizationSettings,
  useUpdateOrganizationSettings,
} from "@/console/src/hooks/queries/admin";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OrgVariant } from "@mitable/shared";
import { createLogger } from "../../../lib/logger";
import { API_BASE_URL } from "../lib/config";

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

interface GranolaStatus {
  connected: boolean;
  expired: boolean;
  email: string | null;
  lastSyncedAt: string | null;
}

interface FirefliesStatus {
  connected: boolean;
  lastSyncedAt: string | null;
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

  const [granolaStatus, setGranolaStatus] = useState<GranolaStatus | null>(null);
  const [isGranolaLoading, setIsGranolaLoading] = useState(true);
  const [isGranolaConnecting, setIsGranolaConnecting] = useState(false);
  const [isGranolaDisconnecting, setIsGranolaDisconnecting] = useState(false);

  const [firefliesStatus, setFirefliesStatus] = useState<FirefliesStatus | null>(null);
  const [isFirefliesLoading, setIsFirefliesLoading] = useState(true);
  const [isFirefliesConnecting, setIsFirefliesConnecting] = useState(false);
  const [isFirefliesDisconnecting, setIsFirefliesDisconnecting] = useState(false);
  const [showFirefliesModal, setShowFirefliesModal] = useState(false);
  const [firefliesApiKey, setFirefliesApiKey] = useState("");

  // Agent feature toggle
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [isAgentLoading, setIsAgentLoading] = useState(true);

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
    isLoading: isPreferencesLoading,
    updatePreference,
  } = usePreferences();

  // Organization settings hooks (admin only)
  const isAdmin = user?.role === "admin";
  const { data: orgSettings, isLoading: isOrgSettingsLoading } = useOrganizationSettings();
  const { mutate: updateOrgSettings, isPending: isUpdatingOrgSettings } =
    useUpdateOrganizationSettings();
  const currentVariant = orgSettings?.settings?.variant || "global";

  const VARIANT_OPTIONS: { value: OrgVariant; label: string; description: string }[] = [
    {
      value: "global",
      label: "Global (Default)",
      description: "Standard terminology: Docs, Artefacts",
    },
    {
      value: "nigeria",
      label: "Nigeria",
      description: "Regional terminology: Reports, Uploads",
    },
  ];

  // Block list state
  const [blockedApps, setBlockedApps] = useState<string[]>([]);
  const [detectedApps, setDetectedApps] = useState<
    Array<{
      normalizedName: string;
      originalName: string;
      source: "detected" | "installed" | "both";
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
  const [micLevel, setMicLevel] = useState(0); // 0-100 for visual feedback

  // OAuth polling interval refs - for cleanup on unmount
  const linearPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const gmailPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const notionPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const granolaPollIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
      if (granolaPollIntervalRef.current) {
        clearInterval(granolaPollIntervalRef.current);
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
        // Fallback to detected apps only
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

      // Enumerate devices directly in renderer (where navigator.mediaDevices works)
      try {
        // CRITICAL: Request permission first to get device labels
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Now enumerate - labels will be available after permission granted
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

        // Stop the permission stream - we only needed it for labels
        stream.getTracks().forEach((track) => track.stop());

        setAudioDevices(audioInputs);
        setAudioOutputDevices(audioOutputs);
        logger.info(`Found ${audioInputs.length} microphones and ${audioOutputs.length} speakers`);
      } catch (error) {
        logger.error("Failed to enumerate audio devices:", error);
        setAudioDevices([]);
        setAudioOutputDevices([]);
      }

      // Load saved preferences
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

      // Get audio stream from selected device or default
      const constraints: MediaStreamConstraints = {
        audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true,
      };

      logger.info("Starting mic test with constraints:", constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      testMicrophoneRef.current = stream;

      // Log which device is actually being used
      const tracks = stream.getAudioTracks();
      if (tracks.length > 0) {
        logger.info("Using microphone:", tracks[0].label, "ID:", tracks[0].id);
      }

      // Create audio context and analyser
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = 2048; // Larger for better resolution
      analyser.smoothingTimeConstant = 0.3; // Smoother but still responsive
      microphone.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      // Start monitoring audio levels using TIME DOMAIN data (amplitude)
      const dataArray = new Uint8Array(analyser.fftSize);
      let frameCount = 0;
      const updateLevel = () => {
        if (!analyserRef.current) return;

        // Use getByteTimeDomainData for amplitude detection (better for voice)
        analyserRef.current.getByteTimeDomainData(dataArray);

        // Calculate RMS using raw byte values (0-255)
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);

        // Convert to percentage (0-100) - 128 is silence, values above/below indicate sound
        const deviation = Math.abs(rms - 128);
        // Amplify by 25x for visible response during normal speech
        const level = Math.min(100, Math.round((deviation / 128) * 100 * 25));

        // Debug logging - log every 30 frames (~0.5 seconds)
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
    // Stop animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Stop audio stream
    if (testMicrophoneRef.current) {
      testMicrophoneRef.current.getTracks().forEach((track) => track.stop());
      testMicrophoneRef.current = null;
    }

    // Close audio context
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

  useEffect(() => {
    if (!user?.id) return;
    window.consoleAPI
      ?.getAgentEnabled(user.id)
      .then((enabled) => {
        setAgentEnabled(enabled);
        setIsAgentLoading(false);
      })
      .catch((err) => {
        logger.error("Failed to load agent toggle:", err);
        setIsAgentLoading(false);
      });
  }, [user?.id]);

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

  // Tab state — honor ?tab= query param from sidebar menu
  const [searchParams] = useSearchParams();
  const validTabs = [
    "account",
    "security",
    "preferences",
    "beta",
    "integrations",
    "update",
  ] as const;
  type TabId = (typeof validTabs)[number];
  const initialTab = validTabs.includes(searchParams.get("tab") as TabId)
    ? (searchParams.get("tab") as TabId)
    : "account";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  useEffect(() => {
    const tabParam = searchParams.get("tab") as TabId;
    if (tabParam && validTabs.includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  const tabs = [
    { id: "account" as const, label: "Account", icon: User },
    { id: "security" as const, label: "Security", icon: Lock },
    { id: "preferences" as const, label: "Preferences", icon: Settings },
    { id: "beta" as const, label: "Beta", icon: MitableIcon },
    { id: "integrations" as const, label: "Integrations", icon: Link2 },
    { id: "update" as const, label: "Update", icon: RefreshCw },
  ];

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      {/* Settings sidebar navigation */}
      <div
        style={{
          width: 200,
          minWidth: 200,
          borderRight: "0.5px solid rgba(236, 232, 224, 0.06)",
          padding: "28px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          overflowY: "auto",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 18,
            color: "#ECE8E0",
            fontWeight: 400,
            letterSpacing: "-0.2px",
            margin: "0 0 16px",
            padding: "0 10px",
          }}
        >
          Settings
        </h2>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "8px 10px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 400,
                color: isActive ? "#ECE8E0" : "#6B665C",
                background: isActive ? "rgba(236, 232, 224, 0.06)" : "none",
                border: "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
                textAlign: "left",
                width: "100%",
                transition: "color 0.15s ease, background 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = "#9B9689";
                  e.currentTarget.style.background = "rgba(236, 232, 224, 0.03)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = "#6B665C";
                  e.currentTarget.style.background = "none";
                }
              }}
            >
              <tab.icon size={14} strokeWidth={1.5} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Settings content area */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 640, padding: "28px 36px" }}>
          {/* Section Content */}
          {/* Account Tab */}
          {activeTab === "account" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
              {/* Account Information Section */}
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div
                  style={{
                    paddingBottom: 16,
                    borderBottom: "0.5px solid rgba(236, 232, 224, 0.06)",
                  }}
                >
                  <h2
                    style={{
                      fontSize: 16,
                      fontWeight: 500,
                      color: "#ECE8E0",
                      margin: 0,
                    }}
                  >
                    Account Information
                  </h2>
                  <p
                    style={{
                      fontSize: 13,
                      color: "#6B665C",
                      margin: "6px 0 0",
                    }}
                  >
                    Your profile details
                  </p>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 20,
                  }}
                >
                  {[
                    { label: "Name", value: user?.name || "Not set" },
                    { label: "Email", value: user?.email || "Not available" },
                    {
                      label: "Role",
                      value: user?.role || "Employee",
                      accent: true,
                    },
                    {
                      label: "Organization ID",
                      value: user?.organizationId || "Not available",
                      mono: true,
                    },
                  ].map((field) => (
                    <div key={field.label}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          color: "#6B665C",
                          marginBottom: 6,
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                        }}
                      >
                        {field.label}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: field.accent
                            ? "var(--mi-accent)"
                            : field.mono
                              ? "#6B665C"
                              : "#ECE8E0",
                          fontFamily: field.mono ? "monospace" : "inherit",
                          padding: "9px 12px",
                          borderRadius: 6,
                          border: "0.5px solid rgba(236, 232, 224, 0.06)",
                          background: "rgba(236, 232, 224, 0.03)",
                          textTransform: field.accent ? "capitalize" : undefined,
                          fontWeight: field.accent ? 500 : 400,
                        }}
                      >
                        {field.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Subscription Section */}
              <div>
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 500,
                    color: "#ECE8E0",
                    margin: "0 0 16px",
                  }}
                >
                  Subscription
                </h3>
                <BillingSection />
              </div>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === "security" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                <div
                  style={{
                    paddingBottom: 16,
                    borderBottom: "0.5px solid rgba(236, 232, 224, 0.06)",
                  }}
                >
                  <h2
                    style={{
                      fontSize: 16,
                      fontWeight: 500,
                      color: "#ECE8E0",
                      margin: 0,
                    }}
                  >
                    Change Password
                  </h2>
                  <p
                    style={{
                      fontSize: 13,
                      color: "#6B665C",
                      margin: "6px 0 0",
                    }}
                  >
                    Update your password to keep your account secure
                  </p>
                </div>

                <form
                  onSubmit={handlePasswordChange}
                  style={{ display: "flex", flexDirection: "column", gap: 20 }}
                >
                  {/* Current Password */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label
                      htmlFor="currentPassword"
                      style={{ fontSize: 13, fontWeight: 500, color: "#9B9689" }}
                    >
                      Current Password
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        id="currentPassword"
                        type={showCurrentPassword ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required
                        disabled={isChangingPassword}
                        placeholder="Enter your current password"
                        style={{
                          width: "100%",
                          height: 38,
                          borderRadius: 6,
                          border: "0.5px solid rgba(236, 232, 224, 0.1)",
                          background: "rgba(236, 232, 224, 0.03)",
                          padding: "0 36px 0 12px",
                          fontSize: 13,
                          color: "#ECE8E0",
                          outline: "none",
                          opacity: isChangingPassword ? 0.5 : 1,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        disabled={isChangingPassword}
                        style={{
                          position: "absolute",
                          right: 10,
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "none",
                          border: "none",
                          color: "#6B665C",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* New Password */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label
                      htmlFor="newPassword"
                      style={{ fontSize: 13, fontWeight: 500, color: "#9B9689" }}
                    >
                      New Password
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        id="newPassword"
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        disabled={isChangingPassword}
                        placeholder="Enter your new password"
                        style={{
                          width: "100%",
                          height: 38,
                          borderRadius: 6,
                          border: "0.5px solid rgba(236, 232, 224, 0.1)",
                          background: "rgba(236, 232, 224, 0.03)",
                          padding: "0 36px 0 12px",
                          fontSize: 13,
                          color: "#ECE8E0",
                          outline: "none",
                          opacity: isChangingPassword ? 0.5 : 1,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        disabled={isChangingPassword}
                        style={{
                          position: "absolute",
                          right: 10,
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "none",
                          border: "none",
                          color: "#6B665C",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>

                    {/* Password strength indicator */}
                    {newPassword && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                        <div
                          style={{
                            flex: 1,
                            height: 4,
                            background: "rgba(236, 232, 224, 0.06)",
                            borderRadius: 2,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            className={`h-full transition-all duration-300 ${strengthColors[passwordStrength]} ${strengthWidth[passwordStrength]}`}
                          />
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            color: "#6B665C",
                            textTransform: "capitalize",
                            minWidth: 50,
                          }}
                        >
                          {passwordStrength}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label
                      htmlFor="confirmPassword"
                      style={{ fontSize: 13, fontWeight: 500, color: "#9B9689" }}
                    >
                      Confirm New Password
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        disabled={isChangingPassword}
                        placeholder="Confirm your new password"
                        style={{
                          width: "100%",
                          height: 38,
                          borderRadius: 6,
                          border: "0.5px solid rgba(236, 232, 224, 0.1)",
                          background: "rgba(236, 232, 224, 0.03)",
                          padding: "0 36px 0 12px",
                          fontSize: 13,
                          color: "#ECE8E0",
                          outline: "none",
                          opacity: isChangingPassword ? 0.5 : 1,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        disabled={isChangingPassword}
                        style={{
                          position: "absolute",
                          right: 10,
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "none",
                          border: "none",
                          color: "#6B665C",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>

                    {/* Password Match Indicator */}
                    {confirmPassword && newPassword && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginTop: 4,
                          fontSize: 12,
                        }}
                      >
                        {confirmPassword === newPassword ? (
                          <>
                            <Check size={14} style={{ color: "#4ADE80", flexShrink: 0 }} />
                            <span style={{ color: "#4ADE80" }}>Passwords match</span>
                          </>
                        ) : (
                          <>
                            <X size={14} style={{ color: "#E5534B", flexShrink: 0 }} />
                            <span style={{ color: "#E5534B" }}>Passwords don't match</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Password requirements */}
                  {newPassword && (
                    <div
                      style={{
                        padding: 14,
                        borderRadius: 8,
                        border: "0.5px solid rgba(236, 232, 224, 0.06)",
                        background: "rgba(236, 232, 224, 0.02)",
                      }}
                    >
                      <p
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          color: "#6B665C",
                          margin: "0 0 10px",
                        }}
                      >
                        Password must contain:
                      </p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                        {requirements.map((req, idx) => {
                          const isMet = req.test(newPassword);
                          return (
                            <div
                              key={idx}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                fontSize: 12,
                              }}
                            >
                              {isMet ? (
                                <Check size={14} style={{ color: "#4ADE80", flexShrink: 0 }} />
                              ) : (
                                <X size={14} style={{ color: "#4B4740", flexShrink: 0 }} />
                              )}
                              <span style={{ color: isMet ? "#4ADE80" : "#4B4740" }}>
                                {req.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div style={{ paddingTop: 8 }}>
                    <button
                      type="submit"
                      disabled={isChangingPassword}
                      style={{
                        padding: "8px 20px",
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 500,
                        color: "#1A1916",
                        background: "var(--mi-accent)",
                        border: "none",
                        cursor: isChangingPassword ? "not-allowed" : "pointer",
                        opacity: isChangingPassword ? 0.6 : 1,
                        transition: "opacity 0.15s ease",
                      }}
                    >
                      {isChangingPassword ? "Changing Password..." : "Change Password"}
                    </button>
                  </div>
                </form>

                {/* Block List Section */}
                <div
                  style={{
                    paddingTop: 24,
                    borderTop: "0.5px solid rgba(236, 232, 224, 0.06)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Shield size={16} style={{ color: "#6B665C" }} />
                    <h3 style={{ fontSize: 16, fontWeight: 500, color: "#ECE8E0", margin: 0 }}>
                      Blocked Apps
                    </h3>
                  </div>
                  <p style={{ fontSize: 13, color: "#6B665C", margin: 0 }}>
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
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium text-text-primary">
                            Add App to Block List
                          </Label>
                          <ShadcnButton
                            variant="ghost"
                            size="sm"
                            onClick={handleRefreshAppList}
                            disabled={isRefreshingApps}
                            className="h-7 px-2 text-xs text-text-tertiary hover:text-text-primary"
                          >
                            {isRefreshingApps ? (
                              <Loader2 className="w-3 h-3 animate-spin mr-1" />
                            ) : (
                              <RefreshCw className="w-3 h-3 mr-1" />
                            )}
                            Refresh
                          </ShadcnButton>
                        </div>
                        {isRefreshingApps && detectedApps.length === 0 ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="w-5 h-5 animate-spin text-text-tertiary mr-2" />
                            <span className="text-xs text-text-tertiary">
                              Scanning installed apps...
                            </span>
                          </div>
                        ) : detectedApps.length === 0 ? (
                          <p className="text-xs text-text-tertiary italic">
                            No apps found. Click Refresh to scan for installed apps on your system.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {/* Search input */}
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                              <input
                                type="text"
                                placeholder="Search apps..."
                                value={appSearchQuery}
                                onChange={(e) => setAppSearchQuery(e.target.value)}
                                className="w-full pl-8 pr-3 py-2 text-sm bg-background-secondary border border-border-subtle rounded-lg text-white placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent-blue"
                              />
                              {appSearchQuery && (
                                <button
                                  onClick={() => setAppSearchQuery("")}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary hover:text-text-primary"
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                            {/* App list */}
                            <div className="max-h-48 overflow-y-auto border border-border-subtle rounded-lg">
                              {(() => {
                                const filteredApps = detectedApps
                                  .filter((app) => !blockedApps.includes(app.normalizedName))
                                  .filter((app) => {
                                    if (!appSearchQuery.trim()) return true;
                                    const query = appSearchQuery.toLowerCase();
                                    return (
                                      app.originalName.toLowerCase().includes(query) ||
                                      app.normalizedName.includes(query)
                                    );
                                  });

                                if (filteredApps.length === 0) {
                                  return (
                                    <div className="px-3 py-2 text-xs text-text-tertiary italic">
                                      {appSearchQuery
                                        ? "No apps match your search"
                                        : "All apps are already blocked"}
                                    </div>
                                  );
                                }

                                return filteredApps.map((app) => {
                                  const displayName = cleanAppName(app.originalName);
                                  const isInstalledOnly = app.source === "installed";
                                  return (
                                    <button
                                      key={app.normalizedName}
                                      onClick={() => handleAddBlockedApp(app.normalizedName)}
                                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-background-secondary transition-colors text-left"
                                    >
                                      <Plus size={14} className="text-text-tertiary" />
                                      <span className="text-sm text-white flex-1">
                                        {displayName}
                                      </span>
                                      {isInstalledOnly && (
                                        <span className="text-[10px] text-text-tertiary bg-background-secondary px-1.5 py-0.5 rounded">
                                          not opened
                                        </span>
                                      )}
                                    </button>
                                  );
                                });
                              })()}
                            </div>
                            {/* App count */}
                            <p className="text-[10px] text-text-tertiary">
                              {
                                detectedApps.filter(
                                  (app) => !blockedApps.includes(app.normalizedName)
                                ).length
                              }{" "}
                              apps available
                            </p>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Preferences Tab */}
          {activeTab === "preferences" && (
            <div>
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                <div
                  style={{
                    paddingBottom: 16,
                    borderBottom: "0.5px solid rgba(236, 232, 224, 0.06)",
                  }}
                >
                  <h2 style={{ fontSize: 16, fontWeight: 500, color: "#ECE8E0", margin: 0 }}>
                    Session Preferences
                  </h2>
                  <p style={{ fontSize: 13, color: "#6B665C", margin: "6px 0 0" }}>
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

                {/* Pill Display Mode Toggle */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 flex-1 pr-4">
                    <Label
                      htmlFor="pill-display-mode"
                      className="text-sm font-medium text-text-primary cursor-pointer"
                    >
                      Always Show Expanded Pill
                    </Label>
                    <p className="text-xs text-text-tertiary">
                      Keep the watching pill fully expanded with all controls visible instead of
                      compact mode
                    </p>
                  </div>
                  {isPillDisplayModeLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-text-tertiary flex-shrink-0" />
                  ) : (
                    <Switch
                      id="pill-display-mode"
                      checked={pillDisplayMode === "expanded"}
                      onCheckedChange={(checked) =>
                        handlePillDisplayModeChange(checked ? "expanded" : "compact")
                      }
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
                      How often (in minutes) you'd like to receive reminders to record work sessions
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

                {/* Passive Monitoring Toggle */}
                <div className="flex items-center justify-between pt-4 border-t border-border-subtle">
                  <div className="space-y-0.5 flex-1 pr-4">
                    <Label
                      htmlFor="passive-monitoring-toggle"
                      className="text-sm font-medium text-text-primary cursor-pointer"
                    >
                      Passive Monitoring
                    </Label>
                    <p className="text-xs text-text-tertiary">
                      Automatically start sessions when sustained activity is detected and end them
                      after inactivity. No need to manually start or stop blocks.
                    </p>
                  </div>
                  {isPassiveMonitoringLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-text-tertiary flex-shrink-0" />
                  ) : (
                    <Switch
                      id="passive-monitoring-toggle"
                      checked={passiveMonitoring}
                      onCheckedChange={handlePassiveMonitoringChange}
                      className="flex-shrink-0"
                    />
                  )}
                </div>

                {/* Auto Recap Toggle */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 flex-1 pr-4">
                    <Label
                      htmlFor="auto-recap-toggle-profile"
                      className="text-sm font-medium text-text-primary cursor-pointer"
                    >
                      Auto Recap
                    </Label>
                    <p className="text-xs text-text-tertiary">
                      Automatically generate a daily recap when sessions end. When disabled, you can
                      still create recaps manually from the Recaps page.
                    </p>
                  </div>
                  {isAutoRecapLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-text-tertiary flex-shrink-0" />
                  ) : (
                    <Switch
                      id="auto-recap-toggle-profile"
                      checked={autoRecap}
                      onCheckedChange={handleAutoRecapChange}
                      className="flex-shrink-0"
                    />
                  )}
                </div>

                {/* Audio Settings Section */}
                <div
                  style={{
                    paddingTop: 24,
                    borderTop: "0.5px solid rgba(236, 232, 224, 0.06)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ color: "#6B665C" }}
                    >
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" x2="12" y1="19" y2="22" />
                    </svg>
                    <h3 style={{ fontSize: 16, fontWeight: 500, color: "#ECE8E0", margin: 0 }}>
                      Audio Recording
                    </h3>
                  </div>
                  <p className="text-body-sm text-text-tertiary">
                    Configure your microphone and system audio for session recordings
                  </p>

                  {isAudioPrefsLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
                    </div>
                  ) : (
                    <>
                      {/* Microphone Selection */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-text-primary">Microphone</Label>
                        <select
                          value={selectedMicId || "default"}
                          onChange={(e) => handleMicrophoneChange(e.target.value)}
                          className="w-full px-3 py-2 bg-[#2a2a2a] border border-border-subtle rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary cursor-pointer hover:bg-[#323232] transition-colors [&>option]:bg-[#2a2a2a] [&>option]:text-white [&>option]:py-2"
                          style={{
                            colorScheme: "dark",
                          }}
                        >
                          <option value="default" className="bg-[#2a2a2a] text-white">
                            System Default (Auto-detect)
                          </option>
                          {audioDevices.map((device) => (
                            <option
                              key={device.deviceId}
                              value={device.deviceId}
                              className="bg-[#2a2a2a] text-white"
                            >
                              {device.label}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-text-tertiary">
                          System Default will automatically use whichever microphone your computer
                          is currently using. Select a specific device to override this behavior.
                        </p>
                      </div>

                      {/* System Audio Toggle */}
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5 flex-1 pr-4">
                          <Label
                            htmlFor="system-audio-toggle"
                            className="text-sm font-medium text-text-primary cursor-pointer"
                          >
                            Capture System Audio
                          </Label>
                          <p className="text-xs text-text-tertiary">
                            Record audio from apps (Zoom, Slack, browser audio, etc.)
                          </p>
                        </div>
                        <Switch
                          id="system-audio-toggle"
                          checked={systemAudioEnabled}
                          onCheckedChange={handleSystemAudioToggle}
                          className="flex-shrink-0"
                        />
                      </div>

                      {/* System Audio Output Device Selection - only show when enabled */}
                      {systemAudioEnabled && (
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-text-primary">
                            System Audio Source
                          </Label>
                          <select
                            value={selectedOutputId || "default"}
                            onChange={(e) => handleOutputDeviceChange(e.target.value)}
                            className="w-full px-3 py-2 bg-[#2a2a2a] border border-border-subtle rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary cursor-pointer hover:bg-[#323232] transition-colors [&>option]:bg-[#2a2a2a] [&>option]:text-white [&>option]:py-2"
                            style={{
                              colorScheme: "dark",
                            }}
                          >
                            <option value="default" className="bg-[#2a2a2a] text-white">
                              System Default (Auto-detect)
                            </option>
                            {audioOutputDevices.map((device) => (
                              <option
                                key={device.deviceId}
                                value={device.deviceId}
                                className="bg-[#2a2a2a] text-white"
                              >
                                {device.label}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-text-tertiary">
                            Choose which speakers/output to monitor. If your monitor speakers aren't
                            working, select your physical speakers instead.
                          </p>
                        </div>
                      )}

                      {/* Mic Test Button with Level Visualization */}
                      <div className="space-y-3 pt-2">
                        <button
                          onClick={() => {
                            if (isMicTesting) {
                              stopMicTest();
                            } else {
                              startMicTest();
                            }
                          }}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            isMicTesting
                              ? "bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40"
                              : "bg-accent-primary hover:bg-accent-primary/90 text-white"
                          }`}
                        >
                          {isMicTesting ? "Stop Testing" : "Test Microphone"}
                        </button>

                        {/* Audio Level Visualization */}
                        {isMicTesting && (
                          <div className="space-y-2">
                            <p className="text-xs text-text-tertiary">
                              Speak into your microphone to see audio levels
                            </p>
                            <div className="flex items-center justify-center gap-1 h-16 px-3 py-2 bg-[#1a1a1a] rounded-lg border border-border-subtle">
                              {/* Waveform Visualization - 20 dots expanding from center */}
                              {Array.from({ length: 20 }).map((_, i) => {
                                // Calculate distance from center (0 = center, 10 = edges)
                                const center = 10;
                                const distanceFromCenter = Math.abs(i - center);

                                // Convert distance to threshold (center activates first at low levels)
                                const threshold = (distanceFromCenter / 10) * 100;
                                const active = micLevel > threshold;

                                // Silent state: 4px circle
                                // Active state: 3px wide, stretch up to 48px tall
                                const isActive = active && micLevel > 5;
                                const barHeight = isActive
                                  ? Math.max(8, Math.min(48, (micLevel / 100) * 48))
                                  : 4;
                                const barWidth = isActive ? 3 : 4;

                                return (
                                  <div
                                    key={i}
                                    className="transition-all duration-75"
                                    style={{
                                      width: `${barWidth}px`,
                                      height: `${barHeight}px`,
                                      backgroundColor: isActive ? "#10b981" : "#4b5563",
                                      borderRadius: isActive ? "2px" : "50%",
                                      opacity: isActive ? 1 : 0.5,
                                    }}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Organization Settings Section (Admin Only) */}
              {isAdmin && (
                <div style={{ marginTop: 32 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                    <div
                      style={{
                        paddingBottom: 16,
                        borderBottom: "0.5px solid rgba(236, 232, 224, 0.06)",
                      }}
                    >
                      <h2 style={{ fontSize: 16, fontWeight: 500, color: "#ECE8E0", margin: 0 }}>
                        Organization Settings
                      </h2>
                      <p style={{ fontSize: 13, color: "#6B665C", margin: "6px 0 0" }}>
                        Configure settings that apply to all users in your organization
                      </p>
                    </div>

                    {/* Region Variant Selector */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                          <Globe size={18} className="text-emerald-400" />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-sm font-medium text-text-primary">
                            Region Variant
                          </Label>
                          <p className="text-xs text-text-tertiary">
                            Customize UI labels based on your region. Changes terminology for
                            Documents and Artifacts across the application.
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {isOrgSettingsLoading ? (
                          <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
                        ) : (
                          <Select
                            value={currentVariant}
                            onValueChange={(v) => {
                              updateOrgSettings(
                                { variant: v as OrgVariant },
                                {
                                  onSuccess: () => {
                                    toast({
                                      title: "Region updated",
                                      description: `UI labels changed to ${v === "nigeria" ? "Nigeria" : "Global"} variant`,
                                    });
                                  },
                                  onError: () => {
                                    toast({
                                      title: "Error",
                                      description: "Failed to update region setting",
                                      variant: "destructive",
                                    });
                                  },
                                }
                              );
                            }}
                            disabled={isUpdatingOrgSettings}
                          >
                            <SelectTrigger className="w-[200px] h-10 text-sm bg-background-elevated border-border-subtle">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {VARIANT_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  <div>
                                    <span className="font-medium">{option.label}</span>
                                    <p className="text-xs text-text-tertiary">
                                      {option.description}
                                    </p>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>

                    {/* Info note */}
                    <p className="text-xs text-text-tertiary bg-background-elevated rounded-lg p-3 border border-border-subtle">
                      <span className="font-medium text-text-secondary">Note:</span> Changing the
                      region variant will update UI labels for all users in your organization.
                      Underlying data and functionality remain the same.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Beta Tab */}
          {activeTab === "beta" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <div
                style={{
                  paddingBottom: 16,
                  borderBottom: "0.5px solid rgba(236, 232, 224, 0.06)",
                }}
              >
                <h2 style={{ fontSize: 16, fontWeight: 500, color: "#ECE8E0", margin: 0 }}>
                  Beta Features
                </h2>
                <p style={{ fontSize: 13, color: "#6B665C", margin: "6px 0 0" }}>
                  Toggle features that are still in development
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 0",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <Label
                    htmlFor="agent-toggle"
                    style={{ fontSize: 14, fontWeight: 500, color: "#ECE8E0", cursor: "pointer" }}
                  >
                    Agent
                  </Label>
                  <p style={{ fontSize: 12, color: "#6B665C", margin: 0 }}>
                    Enable the AI Agent in the sidebar for chat-based assistance
                  </p>
                </div>
                {isAgentLoading ? (
                  <Loader2 size={16} style={{ color: "#4B4740" }} className="animate-spin" />
                ) : (
                  <Switch
                    id="agent-toggle"
                    checked={agentEnabled}
                    onCheckedChange={async (checked) => {
                      if (!user?.id) return;
                      setAgentEnabled(checked);
                      await window.consoleAPI?.setAgentEnabled(user.id, checked);
                      window.dispatchEvent(new Event("agent-enabled-changed"));
                      toast({
                        title: checked ? "Agent enabled" : "Agent disabled",
                        description: checked
                          ? "Agent is now available in the sidebar"
                          : "Agent has been hidden from the sidebar",
                      });
                    }}
                  />
                )}
              </div>
            </div>
          )}

          {/* Integrations Tab */}
          {activeTab === "integrations" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <div
                style={{
                  paddingBottom: 16,
                  borderBottom: "0.5px solid rgba(236, 232, 224, 0.06)",
                }}
              >
                <h2 style={{ fontSize: 16, fontWeight: 500, color: "#ECE8E0", margin: 0 }}>
                  Integrations
                </h2>
                <p style={{ fontSize: 13, color: "#6B665C", margin: "6px 0 0" }}>
                  Connect apps and services for richer context
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column" }}>
                {/* Integration rows */}
                {(
                  [
                    {
                      key: "linear",
                      name: "Linear",
                      description: "Session updates to tickets",
                      icon: (
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 8,
                            background: "#2A2824",
                            border: "0.5px solid rgba(236, 232, 224, 0.1)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <SiLinear style={{ width: 18, height: 18, color: "#5E6AD2" }} />
                        </div>
                      ),
                      loading: isLinearLoading,
                      connected: linearStatus?.connected ?? false,
                      expired: linearStatus?.expired ?? false,
                      connecting: isConnecting,
                      disconnecting: isDisconnecting,
                      onConnect: handleConnectLinear,
                      onDisconnect: handleDisconnectLinear,
                    },
                    {
                      key: "notion",
                      name: "Notion",
                      description: "Export documents",
                      icon: (
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 8,
                            background: "#2A2824",
                            border: "0.5px solid rgba(236, 232, 224, 0.1)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <SiNotion style={{ width: 18, height: 18, color: "#ECE8E0" }} />
                        </div>
                      ),
                      loading: isNotionLoading,
                      connected: notionStatus?.connected ?? false,
                      expired: notionStatus?.expired ?? false,
                      connecting: isNotionConnecting,
                      disconnecting: isNotionDisconnecting,
                      onConnect: handleConnectNotion,
                      onDisconnect: handleDisconnectNotion,
                    },
                    {
                      key: "gmail",
                      name: "Gmail",
                      description:
                        gmailStatus?.connected && gmailStatus.email
                          ? gmailStatus.email
                          : "Send summaries via email",
                      icon: (
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 8,
                            background: "#2A2824",
                            border: "0.5px solid rgba(236, 232, 224, 0.1)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <SiGmail style={{ width: 18, height: 18, color: "#EA4335" }} />
                        </div>
                      ),
                      loading: isGmailLoading,
                      connected: gmailStatus?.connected ?? false,
                      expired: gmailStatus?.expired ?? false,
                      connecting: isGmailConnecting,
                      disconnecting: isGmailDisconnecting,
                      onConnect: handleConnectGmail,
                      onDisconnect: handleDisconnectGmail,
                    },
                    {
                      key: "granola",
                      name: "Granola",
                      description:
                        granolaStatus?.connected && granolaStatus.email
                          ? granolaStatus.email
                          : "Sync meeting notes",
                      icon: (
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 8,
                            background: "#2A2824",
                            border: "0.5px solid rgba(236, 232, 224, 0.1)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <svg
                            viewBox="0 0 1308 1350"
                            style={{ width: 18, height: 18 }}
                            fill="#C8E64A"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path d="M1033.77,1021.55c-21.6,24.24-40.11,38.92-50.31,45.93c-4.8,3.19-7.8,7.65-11.99,11.48 c-22.2,19.14-46.26,24.83-63.06,38.23c-22.8,17.86-107.98,39.1-132.18,46.54c-40.96,9.31-87.03,12.67-137.43,10.75 c-10.91,0-20.99,0-30.26-0.73c-3.76-0.29-7.54,0.68-11.31,0.72c-0.15,0-0.29,0-0.42,0c-0.4,0-1.07-0.29-2.01-0.86 c-1.06-0.65-2.26-1.06-3.51-1.06c-0.33,0-0.65-0.03-0.97-0.07c-5.08-0.7-7.78,1.09-9.73,2.08c-1.48,0.75-3.09,0.12-4.49-0.77 c-4.43-2.81-14.32-9.14-17.68-10.16c-3.32-1.01-3.64,0.37-5.41,0.68c-1.18,0.21-2.41-0.21-3.3-1.01 c-0.99-0.9-2.06-2.2-4.5-3.5c-4.49-2.39-6.88,3.04-13.55-3.03c-0.97-0.88-1.54-2.61-2.85-2.7c-0.33-0.02-0.56-0.04-0.89-0.1 c-6.72-1.3-18.92-3.8-27.12-6.29c-9.6-2.55-6.61-4.46-10.81-6.37c-56.4-21.05-136.79-62.52-166.19-91.86 c-10.8-10.84-23.4-35.72-31.2-42.1c-6-5.1-18-15.31-21-20.41c-2.4-4.47-0-12.75-4.2-18.49 c-5.4-7.02-16.2-10.85-26.4-26.79c-11.4-17.86-18-41.46-29.4-65.7C202,854.91,175,786.02,175,660.36 c0-84.2,39-200.93,55.8-216.88c10.8-10.21,9.6-32.53,17.39-43.37c89.01-123.75,244.8-214.79,430.2-224.35 c7.53-0.39,15.07-0.63,22.62-0.72c45.74-0.53,91.58,4.47,136.04,15.31c44.41,10.83,86.87,27.73,128.26,46.95 c0,0,4.91,0.39,6.21,1.03c2.16,1.06,3.07,2.99,5.23,4.06c2.16,1.06,5.28,0.16,7.64,0.64c7.77,1.59,9.17,6.21,10.6,8.05 c1.74,2.23,3.83,3.09,7.78,4.22c10.31,2.96,11.67,6.37,13.07,7.94c1.12,1.25,1.61,2.88,2.17,4.34 c0.57,1.48,1.7,2.84,3.28,3.21c3.42,0.8,8.06,4.98,9.02,10.69c0.63,3.72,4.65,5.32,3.55,12.3 c-0.36,2.26,2.05,5.6-10.6,18.07s-39.18,20.33-55.34,14.14c-55.85-21.41-64.13-25.53-86.57-31.65 c-40.96-11.17-75.85-18.76-118.36-17.96c-67.8,1.28-121.21,7.66-185.41,29.98c-28.14,9.97-81.27,37.11-107.93,58.24 c-26.66,21.13-65.26,50.32-81.19,77.33c-5.58,9.46-11.86,18.5-25.06,33.17c-19.2,21.05-41.42,81.93-48.62,111.28 c-1.8,6.38,2.99,13.4,0.59,19.78c-2.4,7.02-13.8,10.21-15,15.95c-4.8,20.41-3.6,46.56-3.6,68.88 c0,12.12,3.6,28.7,7.8,38.27c3,6.38,12.6,10.85,13.8,17.22c0.6,4.46-5.39,9.56-5.4,13.39c0,3.19,5.39,46.57,8.39,52.95 c4.2,7.65,17.4,17.22,21,26.15c2.4,6.38-4.21,12.76,0.59,19.14c3,3.83,12.61,3.82,16.21,8.92 c4.8,6.38,15,24.87,19.8,30.62c3.6,4.47,10.2,6.39,13.2,8.3c9,6.38,1.2,12.11,9.6,21.68 c26.4,29.98,67.2,66.98,106.2,83.57c6.02,2.56,67.75,26.13,71.39,26.15c87,12.83,184.84,11.63,269.44-35.58 c19.8-10.85,131.97-88.81,150.57-181.3c4.2-18.5,9.6-63.16,7.2-81.02c-9.6-66.34-50.48-161.76-125.41-197.09 c-39.91-18.82-70.2-18.5-78-17.22c-22.8,4.46-30.6-8.93-51.6-7.02c-64.2,5.1-127.2,22.97-176.4,74.63 c-45,47.84-54.01,109.08-31.21,147.99c2.4,5.1,1.2,11.48-3.6,14.67c-2.1,1.28-4.05,2.87-4.95,4.55 c-1.79,3.33,3.39,5.11,6.95,6.36c24.96,8.73,33.96,50.84,67,49.06h7.2c0,0,13.8,0,19.2-6.38c4.44-5.24,4.42-11.35,1.27-14.06 c-1.4-1.21-3.18-1.93-3.59-3.74c-0.45-1.99-0.68-4.61-0.68-5.79c0-1.28,1.8-1.92,1.8-3.2c0-3.83-4.2-7.01-3.6-10.84 c0.38-2.04,3.21-4.85,5.21-6.96c1.52-1.6,1.54-3.63,0.55-5.6c-0.04-0.07-0.07-0.14-0.11-0.21c-0.96-1.97-1.14-4.32-0.49-6.41 c0.38-1.2,0.83-2.49,0.83-3.78c0.6-5.74-1.79-8.29-2.39-12.76c0-1.58,8.54-5.32,11.56-7.66c0.89-0.69,0.98-1.84,0.69-2.93 c-0.62-2.32-1.45-3.03-1.45-7.27c0-1.02,0.86-2.44,1.89-3.79c2.08-2.71,4-5.6,4.94-8.88l1.66-5.79 c0.69-2.42,2.53-4.34,4.92-5.15c4.13-1.39,2.22-8.13,6.16-10.01c1.15-0.55,4.02,0.15,8.63-0.83 c9.59-1.91,3-5.1,4.8-10.21c0.84-3.12,3.44-2.81,5.96-2.56c2.02,0.2,3.98-0.46,5.43-1.88c1.43-1.39,2.87-3.02,4.81-3.85 c2.43-1.03,8.81-1.23,13.38-1.27c1.88-0.02,3.74-0.29,5.61-0.51c5.1-0.6,12.33-0.24,15.82-0.77 c4.2-0.64,6.6-4.47,10.19-4.47c3,0,7.21,5.1,10.21,5.1c3,0,6-2.55,9-2.55c1.8,0,2.4,3.19,5.4,3.19h1.2 c0,0,27.6,0.64,56.4,18.49c19.8,12.12,34.2,41.47,34.2,41.47c13.8,23.6-1.51,47.86-1.51,69.55c0,8.93,3,16.58,1.2,24.88 c-1.2,6.38-6,11.49-7.8,16.59c-1.8,4.46-1.79,10.21-7.79,18.49c-4.8,7.02-7.21,7.01-8.41,8.29 c-1.8,1.91-17.34,25.41-27.54,34.34c-27,24.24-51.96,31.34-88.56,31.97c-16.2,0.64-18,3.83-20.4,3.83 c-8.4,0.64-46.79-1.27-58.8-3.19c0,0-53.4-10.21-74.4-20.41c-11.4-5.1-86.41-60.6-103.21-91.86 c-52.2-98.23-40.2-202.84,13.8-273.01c39-51.03,103.2-117.37,255.59-130.13c77.4-6.38,146.41,3.83,200.41,29.35 c76.2,35.72,132,98.87,166.8,173.5C1154.8,743.28,1151.37,887.6,1033.77,1021.55z" />
                          </svg>
                        </div>
                      ),
                      loading: isGranolaLoading,
                      connected: granolaStatus?.connected ?? false,
                      expired: granolaStatus?.expired ?? false,
                      connecting: isGranolaConnecting,
                      disconnecting: isGranolaDisconnecting,
                      onConnect: handleConnectGranola,
                      onDisconnect: handleDisconnectGranola,
                    },
                    {
                      key: "fireflies",
                      name: "Fireflies",
                      description: firefliesStatus?.connected
                        ? "Meeting transcripts synced"
                        : "Sync meeting transcripts",
                      icon: (
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 8,
                            background: "#2A2824",
                            border: "0.5px solid rgba(236, 232, 224, 0.1)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <svg
                            viewBox="0 0 56 56"
                            style={{ width: 18, height: 18 }}
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <defs>
                              <linearGradient id="ff-icon-grad" x1="1" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#E82A73" />
                                <stop offset="30%" stopColor="#C5388F" />
                                <stop offset="54%" stopColor="#9B4AB0" />
                                <stop offset="82%" stopColor="#6262DE" />
                                <stop offset="100%" stopColor="#3B73FF" />
                              </linearGradient>
                            </defs>
                            <path d="M18.4,0H0v18.3h18.4V0z" fill="url(#ff-icon-grad)" />
                            <path
                              d="M40.2,0H21.8v18.3H56v-2.6c0-4.2-1.7-8.1-4.6-11.1C48.4,1.7,44.4,0,40.2,0z"
                              fill="url(#ff-icon-grad)"
                            />
                            <path
                              d="M0,22.1v18.3c0,4.2,1.7,8.1,4.6,11.1c3,2.9,7,4.6,11.2,4.6h2.6V22.1H0z"
                              fill="url(#ff-icon-grad)"
                            />
                            <path d="M40.2,22.1H21.8v18.3h18.4V22.1z" fill="url(#ff-icon-grad)" />
                          </svg>
                        </div>
                      ),
                      loading: isFirefliesLoading,
                      connected: firefliesStatus?.connected ?? false,
                      expired: false,
                      connecting: isFirefliesConnecting,
                      disconnecting: isFirefliesDisconnecting,
                      onConnect: () => setShowFirefliesModal(true),
                      onDisconnect: handleDisconnectFireflies,
                    },
                  ] as const
                ).map((integration, idx, arr) => (
                  <div key={integration.key}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        padding: "14px 0",
                      }}
                    >
                      {integration.icon}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 500,
                            color: "#ECE8E0",
                            lineHeight: 1,
                          }}
                        >
                          {integration.name}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "#6B665C",
                            marginTop: 4,
                            lineHeight: 1,
                          }}
                        >
                          {integration.expired ? (
                            <span style={{ color: "#E8B474" }}>Connection expired</span>
                          ) : (
                            integration.description
                          )}
                        </div>
                      </div>

                      {/* Action area */}
                      {integration.loading ? (
                        <Loader2 size={16} style={{ color: "#4B4740" }} className="animate-spin" />
                      ) : integration.connected ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span
                            style={{
                              fontSize: 12,
                              color: "#4ADE80",
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <Check size={13} />
                            Connected
                          </span>
                          <button
                            onClick={integration.onDisconnect}
                            disabled={integration.disconnecting}
                            style={{
                              background: "none",
                              border: "none",
                              color: "#4B4740",
                              cursor: "pointer",
                              padding: 4,
                              borderRadius: 4,
                              display: "flex",
                              alignItems: "center",
                              transition: "color 0.15s ease",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = "#E5534B";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = "#4B4740";
                            }}
                          >
                            {integration.disconnecting ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Unlink size={14} />
                            )}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={integration.onConnect}
                          disabled={integration.connecting}
                          style={{
                            padding: "6px 14px",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 500,
                            color: "#ECE8E0",
                            background: "rgba(236, 232, 224, 0.06)",
                            border: "0.5px solid rgba(236, 232, 224, 0.1)",
                            cursor: integration.connecting ? "not-allowed" : "pointer",
                            opacity: integration.connecting ? 0.6 : 1,
                            transition: "background 0.15s ease",
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "rgba(236, 232, 224, 0.1)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "rgba(236, 232, 224, 0.06)";
                          }}
                        >
                          {integration.connecting ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : null}
                          Connect
                        </button>
                      )}
                    </div>
                    {idx < arr.length - 1 && (
                      <div
                        style={{
                          height: 0.5,
                          background: "rgba(236, 232, 224, 0.06)",
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Fireflies API Key Modal */}
              {showFirefliesModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                  <div className="bg-background-elevated border border-border-subtle rounded-xl p-6 w-full max-w-md shadow-xl">
                    <div className="flex items-center gap-3 mb-4">
                      <FirefliesIcon size="md" />
                      <div>
                        <h3 className="text-lg font-semibold text-white">Connect Fireflies.ai</h3>
                        <p className="text-sm text-text-tertiary">
                          Enter your API key to sync meetings
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-text-secondary">API Key</label>
                        <input
                          type="password"
                          value={firefliesApiKey}
                          onChange={(e) => setFirefliesApiKey(e.target.value)}
                          placeholder="Enter your Fireflies API key"
                          className="flex h-10 w-full rounded-md border border-border-subtle bg-background-primary px-3 py-2 text-sm text-white placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/50"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && firefliesApiKey.trim()) {
                              handleConnectFireflies();
                            }
                          }}
                        />
                      </div>

                      <div className="p-3 rounded-lg bg-background-primary border border-border-subtle">
                        <p className="text-xs text-text-tertiary">
                          <strong className="text-text-secondary">Where to find your key:</strong>{" "}
                          Go to{" "}
                          <a
                            href="https://app.fireflies.ai/integrations/custom/fireflies"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#7C3AED] hover:underline inline-flex items-center gap-0.5"
                          >
                            Fireflies Integrations
                            <ExternalLink className="w-3 h-3" />
                          </a>{" "}
                          &rarr; API Key section &rarr; Copy your key.
                        </p>
                      </div>

                      <div className="flex gap-3 justify-end">
                        <ShadcnButton
                          variant="ghost"
                          onClick={() => {
                            setShowFirefliesModal(false);
                            setFirefliesApiKey("");
                          }}
                        >
                          Cancel
                        </ShadcnButton>
                        <ShadcnButton
                          onClick={handleConnectFireflies}
                          disabled={!firefliesApiKey.trim() || isFirefliesConnecting}
                          className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white gap-2"
                        >
                          {isFirefliesConnecting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                          Connect
                        </ShadcnButton>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Update Tab */}
          {activeTab === "update" && (
            <div
              style={{
                padding: 20,
                borderRadius: 8,
                border: "0.5px solid rgba(236, 232, 224, 0.06)",
                background: "rgba(236, 232, 224, 0.02)",
              }}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <RefreshCw className="w-6 h-6 text-primary" />
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
