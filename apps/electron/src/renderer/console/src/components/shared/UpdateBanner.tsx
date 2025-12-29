import { useState, useEffect } from "react";
import { Download, X, Loader2, RefreshCw } from "lucide-react";

interface UpdateInfo {
  version: string;
  releaseNotes?: string;
}

interface DownloadProgress {
  percent: number;
  transferred: number;
  total: number;
}

export function UpdateBanner() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [isReadyToInstall, setIsReadyToInstall] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Listen for update available
    const unsubscribeAvailable = window.consoleAPI?.onUpdateAvailable((info) => {
      console.log("[UpdateBanner] Update available:", info);
      setUpdateInfo(info);
      setIsDismissed(false);
    });

    // Listen for download progress
    const unsubscribeProgress = window.consoleAPI?.onUpdateDownloadProgress((progress) => {
      console.log("[UpdateBanner] Download progress:", progress);
      setDownloadProgress(progress);
    });

    // Listen for download complete
    const unsubscribeDownloaded = window.consoleAPI?.onUpdateDownloaded((info) => {
      console.log("[UpdateBanner] Update downloaded:", info);
      setIsDownloading(false);
      setDownloadProgress(null);
      setIsReadyToInstall(true);
    });

    return () => {
      unsubscribeAvailable?.();
      unsubscribeProgress?.();
      unsubscribeDownloaded?.();
    };
  }, []);

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      await window.consoleAPI?.downloadUpdate();
    } catch (error) {
      console.error("[UpdateBanner] Download failed:", error);
      setIsDownloading(false);
      setDownloadProgress(null);
    }
  };

  const handleInstall = async () => {
    try {
      await window.consoleAPI?.installUpdate();
      // App will quit and install
    } catch (error) {
      console.error("[UpdateBanner] Install failed:", error);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
  };

  // Don't show if no update, dismissed, or already installing
  if (!updateInfo || isDismissed) {
    return null;
  }

  return (
    <div className="bg-primary/10 border-b border-primary/20 px-4 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-3 flex-1">
          <div className="flex-shrink-0">
            {isReadyToInstall ? (
              <RefreshCw className="h-5 w-5 text-primary" />
            ) : isDownloading ? (
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
            ) : (
              <Download className="h-5 w-5 text-primary" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-primary">
                {isReadyToInstall
                  ? "Update ready to install"
                  : isDownloading
                    ? "Downloading update..."
                    : "Update available"}
              </span>
              <span className="text-sm text-text-secondary">v{updateInfo.version}</span>
            </div>

            {isDownloading && downloadProgress && (
              <div className="mt-2">
                <div className="flex items-center gap-2 text-xs text-text-secondary mb-1">
                  <span>{downloadProgress.percent.toFixed(0)}%</span>
                  <span>·</span>
                  <span>
                    {(downloadProgress.transferred / 1024 / 1024).toFixed(1)} MB /{" "}
                    {(downloadProgress.total / 1024 / 1024).toFixed(1)} MB
                  </span>
                </div>
                <div className="w-full bg-background-elevated rounded-full h-1.5">
                  <div
                    className="bg-primary h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${downloadProgress.percent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 ml-4">
          {isReadyToInstall ? (
            <button
              onClick={handleInstall}
              className="px-4 py-1.5 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-md transition-colors"
            >
              Install & Restart
            </button>
          ) : isDownloading ? (
            <div className="px-4 py-1.5 text-sm font-medium text-text-secondary">
              Downloading...
            </div>
          ) : (
            <button
              onClick={handleDownload}
              className="px-4 py-1.5 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-md transition-colors"
            >
              Download Update
            </button>
          )}

          {!isDownloading && !isReadyToInstall && (
            <button
              onClick={handleDismiss}
              className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-background-elevated rounded-md transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
