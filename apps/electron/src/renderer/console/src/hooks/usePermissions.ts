import { useState, useEffect, useCallback } from "react";

interface PermissionStatus {
  screen: string;
  accessibility: boolean;
  loading: boolean;
}

export function usePermissions() {
  const [status, setStatus] = useState<PermissionStatus>({
    screen: "not-determined",
    accessibility: false,
    loading: true,
  });

  const fetchStatus = useCallback(async () => {
    try {
      const result = await window.consoleAPI?.getPermissionStatus();
      if (result) {
        setStatus({
          screen: result.screen,
          accessibility: result.accessibility,
          loading: false,
        });
      }
    } catch {
      setStatus((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // Stop polling once both permissions are granted — no need to keep checking
    if (status.screen === "granted" && status.accessibility) {
      return;
    }
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus, status.screen, status.accessibility]);

  const requestAccessibility = useCallback(async () => {
    await window.consoleAPI?.requestAccessibilityPermission();
  }, []);

  const openScreenRecording = useCallback(async () => {
    await window.consoleAPI?.openScreenRecordingSettings();
  }, []);

  return {
    ...status,
    requestAccessibility,
    openScreenRecording,
  };
}
