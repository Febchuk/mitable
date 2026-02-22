import { useState, FormEvent, useEffect, useLayoutEffect, useCallback, useRef } from "react";
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
  FileText,
  Search,
  Globe,
  FlaskConical,
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { useDevFlags } from "../context/DevFlagsContext";
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

  // Auto session start state
  const [autoSessionStart, setAutoSessionStart] = useState<boolean>(false);
  const [isAutoSessionStartLoading, setIsAutoSessionStartLoading] = useState(true);

  // Auto recap state
  const [autoRecap, setAutoRecap] = useState<boolean>(true);
  const [isAutoRecapLoading, setIsAutoRecapLoading] = useState(true);

  // Pill display mode state
  const [pillDisplayMode, setPillDisplayMode] = useState<"compact" | "expanded">("compact");
  const [isPillDisplayModeLoading, setIsPillDisplayModeLoading] = useState(true);

  // Summary preferences state
  const [summaryDefaults, setSummaryDefaults] = useState<{
    detailLevel: "concise" | "verbose";
    format: "bullets" | "paragraphs";
    includeScreenshots: boolean;
  }>({
    detailLevel: "concise",
    format: "bullets",
    includeScreenshots: true,
  });
  const [alwaysAskOnSessionEnd, setAlwaysAskOnSessionEnd] = useState<boolean>(true);
  const [isSummaryPrefsLoading, setIsSummaryPrefsLoading] = useState(true);

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

  // Summary preferences functions
  const loadSummaryPreferences = useCallback(async () => {
    try {
      setIsSummaryPrefsLoading(true);
      const prefs = await window.consoleAPI.getSummaryPreferences();
      if (prefs) {
        setSummaryDefaults({
          detailLevel: prefs.detailLevel,
          format: prefs.format,
          includeScreenshots: prefs.includeScreenshots,
        });
        setAlwaysAskOnSessionEnd(prefs.alwaysAskOnSessionEnd);
      }
    } catch (error) {
      logger.error("Error loading summary preferences:", error);
    } finally {
      setIsSummaryPrefsLoading(false);
    }
  }, []);

  const handleAlwaysAskOnSessionEndChange = async (enabled: boolean) => {
    try {
      const result = await window.consoleAPI.setAlwaysAskOnSessionEnd(enabled);
      if (result.success) {
        setAlwaysAskOnSessionEnd(enabled);
        toast({
          title: "Preference saved",
          description: enabled
            ? "You'll be asked for summary preferences when ending sessions"
            : "Sessions will end using your default preferences",
        });
      }
    } catch (error) {
      logger.error("Error setting always ask preference:", error);
      toast({
        title: "Error",
        description: "Failed to save preference",
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

  const handleSummaryDefaultChange = async (
    key: "detailLevel" | "format" | "includeScreenshots",
    value: string | boolean
  ) => {
    try {
      const newDefaults = { ...summaryDefaults, [key]: value };
      const result = await window.consoleAPI.setSummaryDefaults({
        [key]: value,
      });
      if (result.success) {
        setSummaryDefaults(newDefaults);
        toast({
          title: "Preference saved",
          description: "Summary default updated",
        });
      }
    } catch (error) {
      logger.error("Error setting summary default:", error);
      toast({
        title: "Error",
        description: "Failed to save preference",
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
    loadAppVersion();
    loadUserProfile();
    loadAudioPreferences(); // Load audio devices and preferences
    if (user?.id) {
      loadBlockList();
      loadAllBlockableApps();
      loadNotificationFrequency();
      loadAutoSessionStart();
      loadAutoRecap();
      loadPillDisplayMode();
      loadSummaryPreferences();
    }
  }, [
    user?.id,
    loadBlockList,
    loadAllBlockableApps,
    loadNotificationFrequency,
    loadAutoSessionStart,
    loadAutoRecap,
    loadPillDisplayMode,
    loadSummaryPreferences,
    loadAudioPreferences,
  ]);

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
    "account" | "security" | "preferences" | "integrations" | "about" | "dev"
  >("account");

  const { flags, setFlag } = useDevFlags();

  const tabs = [
    { id: "account" as const, label: "Account", icon: User },
    { id: "security" as const, label: "Security", icon: Lock },
    { id: "preferences" as const, label: "Preferences", icon: Settings },
    { id: "integrations" as const, label: "Integrations", icon: Link2 },
    { id: "about" as const, label: "About", icon: Info },
    { id: "dev" as const, label: "Dev", icon: FlaskConical },
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
                        Automatically generate a daily recap when sessions end. When disabled, you
                        can still create recaps manually from the Recaps page.
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

                  {/* Session Summary Defaults Section */}
                  <div className="pt-6 border-t border-border-subtle space-y-4">
                    <div className="flex items-center gap-2">
                      <FileText size={18} className="text-text-tertiary" />
                      <h3 className="text-heading-4 text-white">Session Summary Defaults</h3>
                    </div>
                    <p className="text-body-sm text-text-tertiary">
                      Configure default preferences for session summaries when ending sessions
                    </p>

                    {/* Always Ask for Summary Preferences */}
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5 flex-1 pr-4">
                        <Label
                          htmlFor="always-ask-summary-toggle"
                          className="text-sm font-medium text-text-primary cursor-pointer"
                        >
                          Always ask for summary preferences
                        </Label>
                        <p className="text-xs text-text-tertiary">
                          Show the summary configuration dialog when ending sessions. When disabled,
                          sessions will end immediately using your default preferences.
                        </p>
                      </div>
                      {isSummaryPrefsLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin text-text-tertiary flex-shrink-0" />
                      ) : (
                        <Switch
                          id="always-ask-summary-toggle"
                          checked={alwaysAskOnSessionEnd}
                          onCheckedChange={handleAlwaysAskOnSessionEndChange}
                          className="flex-shrink-0"
                        />
                      )}
                    </div>

                    {/* Default Detail Level */}
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5 flex-1 pr-4">
                        <Label className="text-sm font-medium text-text-primary">
                          Default Detail Level
                        </Label>
                        <p className="text-xs text-text-tertiary">
                          How detailed your session summaries should be
                        </p>
                      </div>
                      {isSummaryPrefsLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin text-text-tertiary flex-shrink-0" />
                      ) : (
                        <RadioGroup
                          value={summaryDefaults.detailLevel}
                          onValueChange={(v) =>
                            handleSummaryDefaultChange("detailLevel", v as "concise" | "verbose")
                          }
                          className="flex gap-4"
                        >
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="concise" id="detail-concise" />
                            <Label
                              htmlFor="detail-concise"
                              className="text-sm text-text-primary cursor-pointer"
                            >
                              Concise
                            </Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="verbose" id="detail-verbose" />
                            <Label
                              htmlFor="detail-verbose"
                              className="text-sm text-text-primary cursor-pointer"
                            >
                              Verbose
                            </Label>
                          </div>
                        </RadioGroup>
                      )}
                    </div>

                    {/* Default Format */}
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5 flex-1 pr-4">
                        <Label className="text-sm font-medium text-text-primary">
                          Default Format
                        </Label>
                        <p className="text-xs text-text-tertiary">
                          How your session summaries should be formatted
                        </p>
                      </div>
                      {isSummaryPrefsLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin text-text-tertiary flex-shrink-0" />
                      ) : (
                        <RadioGroup
                          value={summaryDefaults.format}
                          onValueChange={(v) =>
                            handleSummaryDefaultChange("format", v as "bullets" | "paragraphs")
                          }
                          className="flex gap-4"
                        >
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="bullets" id="format-bullets" />
                            <Label
                              htmlFor="format-bullets"
                              className="text-sm text-text-primary cursor-pointer"
                            >
                              Bullets
                            </Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="paragraphs" id="format-paragraphs" />
                            <Label
                              htmlFor="format-paragraphs"
                              className="text-sm text-text-primary cursor-pointer"
                            >
                              Paragraphs
                            </Label>
                          </div>
                        </RadioGroup>
                      )}
                    </div>

                    {/* Include Screenshots by Default */}
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5 flex-1 pr-4">
                        <Label
                          htmlFor="include-screenshots-toggle"
                          className="text-sm font-medium text-text-primary cursor-pointer"
                        >
                          Include Screenshots by Default
                        </Label>
                        <p className="text-xs text-text-tertiary">
                          Attach key screenshots to your session summaries
                        </p>
                      </div>
                      {isSummaryPrefsLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin text-text-tertiary flex-shrink-0" />
                      ) : (
                        <Switch
                          id="include-screenshots-toggle"
                          checked={summaryDefaults.includeScreenshots}
                          onCheckedChange={(checked) =>
                            handleSummaryDefaultChange("includeScreenshots", checked)
                          }
                          className="flex-shrink-0"
                        />
                      )}
                    </div>
                  </div>

                  {/* Audio Settings Section */}
                  <div className="pt-6 border-t border-border-subtle space-y-4">
                    <div className="flex items-center gap-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-text-tertiary"
                      >
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" x2="12" y1="19" y2="22" />
                      </svg>
                      <h3 className="text-heading-4 text-white">Audio Recording</h3>
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
                          <Label className="text-sm font-medium text-text-primary">
                            Microphone
                          </Label>
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
                              Choose which speakers/output to monitor. If your monitor speakers
                              aren't working, select your physical speakers instead.
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
                              No apps found. Click Refresh to scan for installed apps on your
                              system.
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

                {/* Organization Settings Section (Admin Only) */}
                {isAdmin && (
                  <div className="bg-background-secondary rounded-xl border border-border-subtle p-6 mt-6">
                    <div className="space-y-6">
                      <div className="pb-4 border-b border-border-subtle">
                        <h2 className="text-heading-4 text-white">Organization Settings</h2>
                        <p className="text-body-sm text-text-tertiary mt-1">
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

            {activeTab === "dev" && (
              <Card className="p-6 bg-background-elevated border-border-subtle">
                <h3 className="text-lg font-semibold text-white mb-1">Beta Features</h3>
                <p className="text-sm text-text-tertiary mb-6">
                  Toggle work-in-progress features. These may be incomplete or unstable.
                </p>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label
                        htmlFor="flag-experience"
                        className="text-sm font-medium text-text-primary"
                      >
                        Calendar & Recaps
                      </Label>
                      <p className="text-xs text-text-tertiary mt-0.5">
                        Switch between the new Calendar + Recaps experience and classic Sessions
                      </p>
                    </div>
                    <Switch
                      id="flag-experience"
                      checked={flags.newExperience}
                      onCheckedChange={(v) => setFlag("newExperience", v)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label
                        htmlFor="flag-passive-monitoring"
                        className="text-sm font-medium text-text-primary"
                      >
                        Passive Monitoring
                      </Label>
                      <p className="text-xs text-text-tertiary mt-0.5">
                        Automatically start sessions when activity is detected and end after
                        inactivity
                      </p>
                    </div>
                    <Switch
                      id="flag-passive-monitoring"
                      checked={flags.passiveMonitoring}
                      onCheckedChange={(v) => setFlag("passiveMonitoring", v)}
                    />
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
