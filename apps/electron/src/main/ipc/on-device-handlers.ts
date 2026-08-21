import { ipcMain, BrowserWindow } from "electron";
import { IPC_CHANNELS } from "@mitable/shared";
import { ctx } from "../context";
import { authManager } from "../../services/authManager";

export function registerOnDeviceHandlers() {
  /** @deprecated Ollama removed — returns minimal stub for backward compat */
  ipcMain.handle(IPC_CHANNELS.ON_DEVICE_GET_STATUS, async () => {
    try {
      const { pgDb } = await import("../../services/on-device");
      const dbAvailable = pgDb.isAvailable() || (await pgDb.tryOpen());
      return {
        isSetUp: false,
        serverStatus: "stopped",
        model: null,
        tier: null,
        gpuDescription: "",
        vramMB: 0,
        hasNativeAudio: false,
        recommendedModel: null,
        enabled: false,
        onDeviceAllowed: dbAvailable,
        onDeviceBlockReason: dbAvailable ? null : "PGlite unavailable",
        sqliteAvailable: dbAvailable,
      };
    } catch (err) {
      return {
        isSetUp: false,
        serverStatus: "stopped",
        model: null,
        tier: null,
        gpuDescription: "",
        vramMB: 0,
        hasNativeAudio: false,
        enabled: false,
        onDeviceAllowed: true,
        onDeviceBlockReason: null,
        sqliteAvailable: false,
        error: String(err),
      };
    }
  });

  /** @deprecated Returns process.platform only — hardware detection removed */
  ipcMain.handle(IPC_CHANNELS.ON_DEVICE_GET_PLATFORM, async () => {
    return process.platform;
  });

  ipcMain.handle(IPC_CHANNELS.ON_DEVICE_GET_DOWNLOAD_SUMMARY, async () => {
    try {
      const { getHardwareProfile } = await import("../../services/on-device/ollamaLifecycle");
      const profile = getHardwareProfile();
      const model = profile?.recommendedModel ?? "gemma4:e4b";
      return {
        assets: [
          {
            id: "ollama",
            label: "Ollama + " + model,
            description: "Local AI runtime",
            sizeBytes: 0,
          },
        ],
        totalBytes: 0,
      };
    } catch (err) {
      return { assets: [], totalBytes: 0, error: String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ON_DEVICE_DOWNLOAD_ASSET, async () => {
    return { success: false, error: "Use start-server to initialize Ollama" };
  });

  ipcMain.handle(IPC_CHANNELS.ON_DEVICE_DOWNLOAD_ALL, async () => {
    return { success: false, error: "Use start-server to initialize Ollama" };
  });

  ipcMain.handle(IPC_CHANNELS.ON_DEVICE_REMOVE_ALL, async () => {
    return { success: false, error: "Ollama removed — BYOK cloud inference only" };
  });

  ipcMain.handle(IPC_CHANNELS.ON_DEVICE_REMOVE_ASSET, async () => {
    return { success: false, error: "Individual asset removal not supported with Ollama" };
  });

  ipcMain.handle(IPC_CHANNELS.ON_DEVICE_START_SERVER, async () => {
    return { success: false, error: "Ollama removed — BYOK cloud inference only" };
  });

  ipcMain.handle(IPC_CHANNELS.ON_DEVICE_STOP_SERVER, async () => {
    return { success: false, error: "Ollama removed — BYOK cloud inference only" };
  });

  /** @deprecated Hardware detection removed — returns minimal stub */
  ipcMain.handle(IPC_CHANNELS.ON_DEVICE_GET_SYSTEM_INFO, async () => {
    return {
      cpu: "N/A",
      ramMB: 0,
      os: process.platform,
      gpus: [],
      platform: process.platform,
    };
  });

  ipcMain.handle(IPC_CHANNELS.ON_DEVICE_GET_GPU_PREFERENCE, async (_, userId: string) => {
    try {
      const { pgDb } = await import("../../services/on-device");
      if (!pgDb.isAvailable()) {
        await pgDb.tryOpen();
      }
      return await pgDb.getUserPreference(userId, "preferredGpu");
    } catch {
      return null;
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.ON_DEVICE_SET_GPU_PREFERENCE,
    async (_, userId: string, gpuName: string) => {
      try {
        const { pgDb } = await import("../../services/on-device");
        if (!pgDb.isAvailable()) {
          await pgDb.tryOpen();
        }
        await pgDb.setUserPreference(userId, "preferredGpu", gpuName);
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.ON_DEVICE_SERVER_STATUS, async () => {
    try {
      const { ollamaService } = await import("../../services/on-device/ollamaService");
      const { getHardwareProfile } = await import("../../services/on-device/ollamaLifecycle");
      const profile = getHardwareProfile();
      return {
        status: ollamaService.getStatus(),
        model: ollamaService.getLoadedModel(),
        tier: profile?.tier ?? null,
      };
    } catch (err) {
      return {
        status: "stopped",
        port: 0,
        baseUrl: null,
        textServerStatus: "stopped",
        textServerPort: 0,
        parallelMode: false,
        error: String(err),
      };
    }
  });

  // Inference mode preference (for hybrid pipeline testing)
  ipcMain.handle(IPC_CHANNELS.INFERENCE_MODE_GET, async (_, userId: string) => {
    try {
      const { pgDb } = await import("../../services/on-device");
      // Ensure DB is initialized
      if (!pgDb.isAvailable()) {
        await pgDb.tryOpen();
      }
      const mode = await pgDb.getUserPreference(userId, "inferenceMode");
      console.log(`[IPC] INFERENCE_MODE_GET for ${userId}: raw="${mode}"`);
      // Ensure mode is one of the valid values
      const validMode = mode === "cloud" || mode === "local" ? mode : "auto";
      console.log(`[IPC] INFERENCE_MODE_GET returning: "${validMode}"`);
      return { mode: validMode };
    } catch (err) {
      console.error("[IPC] INFERENCE_MODE_GET failed:", err);
      return { mode: "auto" };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.INFERENCE_MODE_SET,
    async (_, userId: string, mode: "auto" | "local" | "cloud") => {
      try {
        const { pgDb } = await import("../../services/on-device");
        // Ensure DB is initialized
        if (!pgDb.isAvailable()) {
          await pgDb.tryOpen();
        }
        await pgDb.setUserPreference(userId, "inferenceMode", mode);
        console.log(`[IPC] Inference mode set for ${userId}: ${mode}`);
        return { success: true };
      } catch (err) {
        console.error("[IPC] INFERENCE_MODE_SET failed:", err);
        return { success: false, error: String(err) };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.INFERENCE_TEST_PROVIDER,
    async (_, provider?: string, apiKey?: string) => {
      try {
        const { createProvider } = await import("../../services/on-device/providers");

        // If explicit key provided, test it directly
        if (provider && apiKey) {
          const instance = createProvider(provider as any, apiKey);
          return await instance.testConnection();
        }

        // Otherwise test the saved keyVault config
        const { keyVault } = await import("../../services/on-device/keyVault");
        const config = await keyVault.load();
        if (!config) {
          return { ok: false, error: "No saved provider config found" };
        }

        console.log(
          `[InferenceTest] keyVault provider=${config.provider}, keyLen=${config.apiKey?.length}, keyPrefix=${config.apiKey?.slice(0, 10)}`
        );

        const instance = createProvider(config.provider, config.apiKey, config.model);
        return await instance.testConnection();
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.INFERENCE_REFRESH_CONFIG, async () => {
    try {
      const { keyVault } = await import("../../services/on-device/keyVault");
      const resp = await authManager.authenticatedFetch("/api/inference/config");
      if (!resp.ok) {
        return { success: false, error: `Backend returned ${resp.status}` };
      }
      const data = (await resp.json()) as {
        configured: boolean;
        provider?: string;
        apiKey?: string;
        model?: string;
      };
      if (data.configured && data.provider && data.apiKey) {
        await keyVault.store({
          provider: data.provider as "google" | "openai" | "anthropic",
          apiKey: data.apiKey,
          model: data.model,
        });
        return { success: true, provider: data.provider };
      } else {
        await keyVault.clear();
        return { success: true, provider: null };
      }
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // ── BYOK direct keyVault operations (no backend) ──

  ipcMain.handle(
    IPC_CHANNELS.INFERENCE_SAVE_CONFIG,
    async (_, provider: string, apiKey?: string) => {
      try {
        const { keyVault } = await import("../../services/on-device/keyVault");
        const { DEFAULT_MODELS } = await import("../../services/on-device/providers/types");

        // If no new key, just update the provider on existing config
        if (!apiKey) {
          const existing = await keyVault.load();
          if (!existing) return { success: false, error: "No existing key to update" };
          await keyVault.store({
            provider: provider as "google" | "openai" | "anthropic",
            apiKey: existing.apiKey,
            model: DEFAULT_MODELS[provider as keyof typeof DEFAULT_MODELS],
          });
          return { success: true };
        }

        await keyVault.store({
          provider: provider as "google" | "openai" | "anthropic",
          apiKey,
          model: DEFAULT_MODELS[provider as keyof typeof DEFAULT_MODELS],
        });
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.INFERENCE_LOAD_CONFIG, async () => {
    try {
      const { keyVault } = await import("../../services/on-device/keyVault");
      return await keyVault.loadSafe();
    } catch (err) {
      return null;
    }
  });

  ipcMain.handle(IPC_CHANNELS.INFERENCE_CLEAR_CONFIG, async () => {
    try {
      const { keyVault } = await import("../../services/on-device/keyVault");
      await keyVault.clear();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // ── Resend key management ──

  ipcMain.handle(IPC_CHANNELS.RESEND_SAVE_KEY, async (_, apiKey: string) => {
    try {
      const { keyVault } = await import("../../services/on-device/keyVault");
      await keyVault.storeResendKey(apiKey);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.RESEND_HAS_KEY, async () => {
    try {
      const { keyVault } = await import("../../services/on-device/keyVault");
      return await keyVault.hasResendKey();
    } catch {
      return false;
    }
  });

  ipcMain.handle(IPC_CHANNELS.RESEND_CLEAR_KEY, async () => {
    try {
      const { keyVault } = await import("../../services/on-device/keyVault");
      await keyVault.clearResendKey();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // ── Session reprocessing ──

  ipcMain.handle(IPC_CHANNELS.REPROCESS_SESSION, async (_, sessionId: string) => {
    try {
      const { hybridInferenceService, pgDb } = await import("../../services/on-device");
      const { localFrameStorage } = await import("../../services/localFrameStorage");

      const sessionDir = localFrameStorage.getSessionPath(sessionId);
      if (!sessionDir) {
        return { success: false, error: "Session frame data not found on disk" };
      }

      // Full reset: wipe all stale AI output so every batch re-runs from scratch
      await pgDb.deleteActivityBlocksForSession(sessionId);
      await pgDb.deleteCapturesForSession(sessionId);
      await pgDb.deleteClassificationsForSession(sessionId);
      await pgDb.deleteStoryForSession(sessionId);

      // Reset in-memory state so a fresh block.md is created
      hybridInferenceService.resetSessionState();

      const broadcastProgress = (progress: {
        sessionId: string;
        step: string;
        percent: number;
        label: string;
        batchIndex?: number;
        totalBatches?: number;
      }) => {
        if (ctx.consoleWindow && !ctx.consoleWindow.isDestroyed()) {
          ctx.consoleWindow.webContents.send(IPC_CHANNELS.ON_DEVICE_PIPELINE_PROGRESS, progress);
        }
        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send(IPC_CHANNELS.ON_DEVICE_PIPELINE_PROGRESS, progress);
          }
        });
      };

      // Run in background — don't block the IPC response
      hybridInferenceService
        .processAllAtEnd(sessionId, sessionDir, broadcastProgress)
        .then(async () => {
          const { pgDb } = await import("../../services/on-device");
          await pgDb.updateMonitoringSessionStatus(sessionId, "ready");
          BrowserWindow.getAllWindows().forEach((win) => {
            if (!win.isDestroyed()) {
              win.webContents.send(IPC_CHANNELS.MONITORING_SESSION_UPDATE, null);
            }
          });
        })
        .catch((err) => {
          console.error("[Reprocess] Pipeline failed:", err);
        });

      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });
}
