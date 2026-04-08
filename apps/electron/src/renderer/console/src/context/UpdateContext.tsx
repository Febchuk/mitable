import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

type UpdateState = "idle" | "downloaded" | "error";

interface UpdateInfo {
  version: string;
}

interface UpdateContextValue {
  updateState: UpdateState;
  updateInfo: UpdateInfo | null;
  errorMessage: string | null;
  isBannerDismissed: boolean;
  dismissBanner: () => void;
  installUpdate: () => void;
}

const UpdateContext = createContext<UpdateContextValue | null>(null);

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [updateState, setUpdateState] = useState<UpdateState>("idle");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  const isBannerDismissed = !!(updateInfo && dismissedVersion === updateInfo.version);

  useEffect(() => {
    if (!window.consoleAPI) return;

    const unsubDownloaded = window.consoleAPI.onUpdateDownloaded?.((info) => {
      setUpdateInfo({ version: info.version });
      setUpdateState("downloaded");
      setErrorMessage(null);
      setDismissedVersion(null);
    });

    const unsubError = window.consoleAPI.onUpdateError?.((error) => {
      setUpdateState("error");
      setErrorMessage(error.message);
    });

    return () => {
      unsubDownloaded?.();
      unsubError?.();
    };
  }, []);

  const dismissBanner = useCallback(() => {
    if (updateInfo) {
      setDismissedVersion(updateInfo.version);
    }
  }, [updateInfo]);

  const installUpdate = useCallback(() => {
    window.consoleAPI?.installUpdate?.();
  }, []);

  return (
    <UpdateContext.Provider
      value={{
        updateState,
        updateInfo,
        errorMessage,
        isBannerDismissed,
        dismissBanner,
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
