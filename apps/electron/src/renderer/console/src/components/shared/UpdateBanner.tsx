import { useState, useEffect } from "react";
import { Download, X, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { createLogger } from "../../../../lib/logger";

const logger = createLogger("UpdateBanner");

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

export function UpdateBanner() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [isReadyToInstall, setIsReadyToInstall] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Listen for update available
    const unsubscribeAvailable = window.consoleAPI?.onUpdateAvailable((info) => {
      logger.info(" Update available:", info);
      setUpdateInfo(info);
      setIsDismissed(false);
      setError(null);
    });

    // Listen for download progress
    const unsubscribeProgress = window.consoleAPI?.onUpdateDownloadProgress((progress) => {
      logger.info(" Download progress:", progress);
      setDownloadProgress(progress);
    });

    // Listen for download complete
    const unsubscribeDownloaded = window.consoleAPI?.onUpdateDownloaded((info) => {
      logger.info(" Update downloaded:", info);
      setIsDownloading(false);
      setDownloadProgress(null);
      setIsReadyToInstall(true);
      setError(null);
    });

    // Listen for errors
    const unsubscribeError = window.consoleAPI?.onUpdateError((err) => {
      logger.error(" Update error:", err);
      setError(err.message);
      setIsDownloading(false);
      setDownloadProgress(null);
    });

    return () => {
      unsubscribeAvailable?.();
      unsubscribeProgress?.();
      unsubscribeDownloaded?.();
      unsubscribeError?.();
    };
  }, []);

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      setError(null);
      await window.consoleAPI?.downloadUpdate();
    } catch (err) {
      logger.error(" Download failed:", err);
      setIsDownloading(false);
      setDownloadProgress(null);
      setError(err instanceof Error ? err.message : "Download failed");
    }
  };

  const handleRetry = () => {
    setError(null);
    handleDownload();
  };

  const handleInstall = async () => {
    try {
      await window.consoleAPI?.installUpdate();
      // App will quit and install
    } catch (error) {
      logger.error(" Install failed:", error);
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
    <div
      className={`border-b px-4 py-3 ${error ? "bg-red-500/10 border-red-500/20" : "bg-primary/10 border-primary/20"}`}
    >
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-3 flex-1">
          <div className="flex-shrink-0">
            {error ? (
              <AlertCircle className="h-5 w-5 text-red-500" />
            ) : isReadyToInstall ? (
              <RefreshCw className="h-5 w-5 text-primary" />
            ) : isDownloading ? (
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
            ) : (
              <Download className="h-5 w-5 text-primary" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`text-sm font-medium ${error ? "text-red-500" : "text-text-primary"}`}
              >
                {error
                  ? "Update failed"
                  : isReadyToInstall
                    ? "Update ready to install"
                    : isDownloading
                      ? "Downloading update..."
                      : "Update available"}
              </span>
              <span className="text-sm text-text-secondary">v{updateInfo.version}</span>
            </div>
            {error && <p className="text-xs text-red-400 mt-1">{error}</p>}

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
          {error ? (
            <button
              onClick={handleRetry}
              className="px-4 py-1.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors"
            >
              Retry
            </button>
          ) : isReadyToInstall ? (
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
