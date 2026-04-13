/**
 * On-Device AI Settings View
 *
 * VS Code extension-style download manager for local AI components.
 * Users can see what's installed, download missing components, start/stop
 * the inference server, and manage local storage.
 */

import { useState, useEffect, useCallback } from "react";
import {
  HardDrive,
  Download,
  Trash2,
  Play,
  Square,
  CheckCircle2,
  Circle,
  Loader2,
  Cpu,
  Zap,
  AlertCircle,
  ArrowLeft,
  Database,
  Shield,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

interface AssetSummary {
  id: string;
  label: string;
  description: string;
  sizeBytes: number;
}

interface InstalledAsset {
  id: string;
  version: string;
  filePath: string;
  sizeBytes: number;
}

interface DownloadProgress {
  assetId: string;
  label: string;
  phase: string;
  bytesDownloaded: number;
  totalBytes: number;
  percent: number;
  error?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function OnDeviceAIView() {
  const navigate = useNavigate();

  const [platform, setPlatform] = useState<string>("");
  const [isSetUp, setIsSetUp] = useState(false);
  const [serverStatus, setServerStatus] = useState("stopped");
  const [installedAssets, setInstalledAssets] = useState<InstalledAsset[]>([]);
  const [missingAssets, setMissingAssets] = useState<AssetSummary[]>([]);
  const [totalDownloadBytes, setTotalDownloadBytes] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    if (!window.consoleAPI?.onDeviceGetStatus) return;
    try {
      const [status, platformResult, summary] = await Promise.all([
        window.consoleAPI.onDeviceGetStatus(),
        window.consoleAPI.onDeviceGetPlatform(),
        window.consoleAPI.onDeviceGetDownloadSummary(),
      ]);
      setIsSetUp(status.isSetUp);
      setServerStatus(status.serverStatus);
      setInstalledAssets(status.installedAssets);
      setPlatform(typeof platformResult === "string" ? platformResult : "unknown");
      setMissingAssets(summary.assets);
      setTotalDownloadBytes(summary.totalBytes);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!window.consoleAPI?.onDeviceDownloadProgress) return;
    const unsubscribe = window.consoleAPI.onDeviceDownloadProgress((progress) => {
      setDownloadProgress(progress);
      if (progress.phase === "complete" || progress.phase === "error") {
        setTimeout(() => {
          setDownloadProgress(null);
          loadStatus();
        }, 1000);
      }
    });
    return unsubscribe;
  }, [loadStatus]);

  const handleDownloadAll = async () => {
    setIsDownloading(true);
    setError(null);
    try {
      const result = await window.consoleAPI.onDeviceDownloadAll();
      if (!result.success) setError(result.error || "Download failed");
    } catch (err) {
      setError(String(err));
    } finally {
      setIsDownloading(false);
      loadStatus();
    }
  };

  const handleStartServer = async () => {
    setIsStarting(true);
    setError(null);
    try {
      const result = await window.consoleAPI.onDeviceStartServer();
      if (!result.success) setError(result.error || "Failed to start server");
      else setServerStatus("running");
    } catch (err) {
      setError(String(err));
    } finally {
      setIsStarting(false);
      loadStatus();
    }
  };

  const handleStopServer = async () => {
    setIsStopping(true);
    try {
      await window.consoleAPI.onDeviceStopServer();
      setServerStatus("stopped");
    } catch (err) {
      setError(String(err));
    } finally {
      setIsStopping(false);
      loadStatus();
    }
  };

  const handleRemoveAll = async () => {
    setIsRemoving(true);
    try {
      await window.consoleAPI.onDeviceRemoveAll();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsRemoving(false);
      loadStatus();
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: 32, maxWidth: 720 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--text-secondary)",
          }}
        >
          <Loader2 size={16} className="animate-spin" />
          Loading on-device AI status...
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 32px", maxWidth: 720, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "none",
            border: "none",
            color: "var(--text-secondary)",
            fontSize: 13,
            cursor: "pointer",
            padding: 0,
            marginBottom: 16,
          }}
        >
          <ArrowLeft size={14} />
          Back
        </button>

        <h1
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: "var(--text-primary)",
            margin: "0 0 6px",
          }}
        >
          On-Device AI
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          Run AI inference locally on your machine. Screenshots never leave your computer.
        </p>
      </div>

      {/* Privacy banner */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          padding: "14px 16px",
          background: "rgba(34, 197, 94, 0.06)",
          border: "1px solid rgba(34, 197, 94, 0.15)",
          borderRadius: 10,
          marginBottom: 20,
        }}
      >
        <Shield size={18} style={{ color: "#22c55e", flexShrink: 0, marginTop: 1 }} />
        <div>
          <p
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-primary)",
              margin: "0 0 2px",
            }}
          >
            Your screen never leaves your computer
          </p>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
            All screenshot analysis runs on-device. Only text summaries and tasks are
            synced to the cloud.
          </p>
        </div>
      </div>

      {/* Platform detection */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          background: "var(--bg-secondary)",
          borderRadius: 8,
          marginBottom: 20,
          fontSize: 13,
          color: "var(--text-secondary)",
        }}
      >
        <Cpu size={15} />
        <span>
          Detected:{" "}
          <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
            {platform.replace("-", " / ").replace("win32", "Windows").replace("darwin", "macOS")}
          </span>
        </span>
        {platform.includes("cuda") && (
          <span
            style={{
              marginLeft: "auto",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              color: "#22c55e",
              fontSize: 12,
            }}
          >
            <Zap size={12} />
            GPU Accelerated
          </span>
        )}
      </div>

      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            borderRadius: 8,
            marginBottom: 20,
            fontSize: 13,
            color: "#ef4444",
          }}
        >
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      {/* Components list */}
      <div style={{ marginBottom: 24 }}>
        <h2
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary)",
            margin: "0 0 12px",
          }}
        >
          Components
        </h2>

        <div
          style={{
            border: "1px solid var(--border-subtle)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {/* Installed assets */}
          {installedAssets.map((asset) => (
            <div
              key={asset.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <CheckCircle2
                size={16}
                style={{ color: "#22c55e", flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    margin: 0,
                  }}
                >
                  {asset.id
                    .replace("llama-server", "Inference Engine")
                    .replace("vision-model", "Vision Model (SmolVLM2)")
                    .replace("vision-mmproj", "Vision Encoder")
                    .replace("text-model", "Text Model (Phi-3.5)")}
                </p>
                <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: 0 }}>
                  {formatBytes(asset.sizeBytes)} installed
                </p>
              </div>
              <span
                style={{
                  fontSize: 11,
                  color: "#22c55e",
                  fontWeight: 500,
                }}
              >
                Installed
              </span>
            </div>
          ))}

          {/* Missing assets */}
          {missingAssets.map((asset) => (
            <div
              key={asset.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <Circle
                size={16}
                style={{ color: "var(--text-tertiary)", flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    margin: 0,
                  }}
                >
                  {asset.label}
                </p>
                <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: 0 }}>
                  {asset.description} — {formatBytes(asset.sizeBytes)}
                </p>
              </div>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                }}
              >
                Not installed
              </span>
            </div>
          ))}

          {installedAssets.length === 0 && missingAssets.length === 0 && (
            <div
              style={{
                padding: "20px 16px",
                textAlign: "center",
                color: "var(--text-tertiary)",
                fontSize: 13,
              }}
            >
              No components detected
            </div>
          )}
        </div>
      </div>

      {/* Download progress */}
      {downloadProgress && (
        <div
          style={{
            padding: "14px 16px",
            background: "var(--bg-secondary)",
            borderRadius: 10,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>
              {downloadProgress.label}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {downloadProgress.phase === "downloading"
                ? `${downloadProgress.percent}% — ${formatBytes(downloadProgress.bytesDownloaded)} / ${formatBytes(downloadProgress.totalBytes)}`
                : downloadProgress.phase === "extracting"
                  ? "Extracting..."
                  : downloadProgress.phase === "complete"
                    ? "Complete"
                    : downloadProgress.phase}
            </span>
          </div>
          <div
            style={{
              height: 4,
              background: "rgba(var(--ui-rgb), 0.1)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${downloadProgress.percent}%`,
                background:
                  downloadProgress.phase === "error"
                    ? "#ef4444"
                    : downloadProgress.phase === "complete"
                      ? "#22c55e"
                      : "var(--accent-primary)",
                borderRadius: 2,
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
        {missingAssets.length > 0 && (
          <button
            type="button"
            onClick={handleDownloadAll}
            disabled={isDownloading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 18px",
              background: "var(--accent-primary)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: isDownloading ? "not-allowed" : "pointer",
              opacity: isDownloading ? 0.7 : 1,
            }}
          >
            {isDownloading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            {isDownloading
              ? "Downloading..."
              : `Download All (${formatBytes(totalDownloadBytes)})`}
          </button>
        )}

        {isSetUp && serverStatus !== "running" && (
          <button
            type="button"
            onClick={handleStartServer}
            disabled={isStarting}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 18px",
              background: "rgba(34, 197, 94, 0.1)",
              color: "#22c55e",
              border: "1px solid rgba(34, 197, 94, 0.2)",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: isStarting ? "not-allowed" : "pointer",
            }}
          >
            {isStarting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
            {isStarting ? "Starting..." : "Start Local AI"}
          </button>
        )}

        {serverStatus === "running" && (
          <button
            type="button"
            onClick={handleStopServer}
            disabled={isStopping}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 18px",
              background: "rgba(239, 68, 68, 0.08)",
              color: "#ef4444",
              border: "1px solid rgba(239, 68, 68, 0.15)",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: isStopping ? "not-allowed" : "pointer",
            }}
          >
            {isStopping ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
            {isStopping ? "Stopping..." : "Stop Local AI"}
          </button>
        )}

        {installedAssets.length > 0 && (
          <button
            type="button"
            onClick={handleRemoveAll}
            disabled={isRemoving || serverStatus === "running"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 18px",
              background: "none",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor:
                isRemoving || serverStatus === "running" ? "not-allowed" : "pointer",
              opacity: isRemoving || serverStatus === "running" ? 0.5 : 1,
            }}
          >
            {isRemoving ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {isRemoving ? "Removing..." : "Remove All"}
          </button>
        )}
      </div>

      {/* Server status */}
      {isSetUp && (
        <div
          style={{
            padding: "14px 16px",
            background: "var(--bg-secondary)",
            borderRadius: 10,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 13,
            }}
          >
            <Database size={15} style={{ color: "var(--text-secondary)" }} />
            <span style={{ color: "var(--text-secondary)" }}>Inference Server:</span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontWeight: 500,
                color:
                  serverStatus === "running"
                    ? "#22c55e"
                    : serverStatus === "error"
                      ? "#ef4444"
                      : "var(--text-tertiary)",
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background:
                    serverStatus === "running"
                      ? "#22c55e"
                      : serverStatus === "error"
                        ? "#ef4444"
                        : "var(--text-tertiary)",
                }}
              />
              {serverStatus.charAt(0).toUpperCase() + serverStatus.slice(1)}
            </span>
          </div>
        </div>
      )}

      {/* Info footer */}
      <div
        style={{
          fontSize: 12,
          color: "var(--text-tertiary)",
          lineHeight: 1.6,
        }}
      >
        <p style={{ margin: "0 0 4px" }}>
          <strong>Models:</strong> SmolVLM2-2.2B (vision) + Phi-3.5 Mini 3.8B (text)
        </p>
        <p style={{ margin: "0 0 4px" }}>
          <strong>Storage:</strong> ~3.7 GB total for all components
        </p>
        <p style={{ margin: 0 }}>
          <strong>Requirements:</strong> 8 GB+ RAM. NVIDIA GPU recommended for Windows.
        </p>
      </div>
    </div>
  );
}
