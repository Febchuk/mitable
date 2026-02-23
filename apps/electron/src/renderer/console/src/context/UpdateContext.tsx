import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

type UpdateState = "idle" | "available" | "downloading" | "downloaded" | "error";

interface UpdateInfo {
  version: string;
  releaseNotes?: string;
  releaseDate?: string;
}

interface DownloadProgress {
  percent: number;
  transferred: number;
  total: number;
}

interface UpdateContextValue {
  updateState: UpdateState;
  updateInfo: UpdateInfo | null;
  downloadProgress: DownloadProgress | null;
  errorMessage: string | null;
  isBannerDismissed: boolean;
  dismissBanner: () => void;
  downloadUpdate: () => void;
  installUpdate: () => void;
}

const UpdateContext = createContext<UpdateContextValue | null>(null);

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [updateState, setUpdateState] = useState<UpdateState>("idle");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  const isBannerDismissed = !!(updateInfo && dismissedVersion === updateInfo.version);

  useEffect(() => {
    if (!window.consoleAPI) return;

    const unsubAvailable = window.consoleAPI.onUpdateAvailable?.((info) => {
      setUpdateInfo(info);
      setUpdateState("available");
      setDownloadProgress(null);
      setErrorMessage(null);
      // If a new version arrives that's different from dismissed, re-show banner
      if (info.version !== dismissedVersion) {
        setDismissedVersion(null);
      }
    });

    const unsubProgress = window.consoleAPI.onUpdateDownloadProgress?.((progress) => {
      setUpdateState("downloading");
      setDownloadProgress(progress);
    });

    const unsubDownloaded = window.consoleAPI.onUpdateDownloaded?.((info) => {
      setUpdateInfo((prev) => prev ? { ...prev, ...info } : { version: info.version });
      setUpdateState("downloaded");
      setDownloadProgress(null);
      // Re-show banner when download completes (even if previously dismissed)
      setDismissedVersion(null);
    });

    const unsubError = window.consoleAPI.onUpdateError?.((error) => {
      setUpdateState("error");
      setErrorMessage(error.message);
    });

    return () => {
      unsubAvailable?.();
      unsubProgress?.();
      unsubDownloaded?.();
      unsubError?.();
    };
  }, [dismissedVersion]);

  const dismissBanner = useCallback(() => {
    if (updateInfo) {
      setDismissedVersion(updateInfo.version);
    }
  }, [updateInfo]);

  const downloadUpdate = useCallback(() => {
    window.consoleAPI?.downloadUpdate?.();
    setUpdateState("downloading");
  }, []);

  const installUpdate = useCallback(() => {
    window.consoleAPI?.installUpdate?.();
  }, []);

  return (
    <UpdateContext.Provider
      value={{
        updateState,
        updateInfo,
        downloadProgress,
        errorMessage,
        isBannerDismissed,
        dismissBanner,
        downloadUpdate,
        installUpdate,
      }}
    >
      {children}
    </UpdateContext.Provider>
  );
}

export function useUpdate() {
  const ctx = useContext(UpdateContext);
  if (!ctx) {
    throw new Error("useUpdate must be used within an UpdateProvider");
  }
  return ctx;
}
