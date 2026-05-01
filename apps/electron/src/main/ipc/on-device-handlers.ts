import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@mitable/shared";
import { ctx } from "../context";

export function registerOnDeviceHandlers() {
  ipcMain.handle(IPC_CHANNELS.ON_DEVICE_GET_STATUS, async () => {
    try {
      const { modelManager, localDb } = await import("../../services/on-device");
      const { ollamaService } = await import("../../services/on-device/ollamaService");
      const { getHardwareProfile } = await import("../../services/on-device/ollamaLifecycle");
      const { detectHardware } = await import("../../services/on-device/hardwareDetector");
      const sqliteAvailable = localDb.isAvailable() || (await localDb.tryOpen());

      const profile = getHardwareProfile() ?? (await detectHardware());

      return {
        isSetUp: ollamaService.isReady(),
        serverStatus: ollamaService.getStatus(),
        model: ollamaService.getLoadedModel(),
        tier: profile.tier,
        gpuDescription: profile.gpuName,
        vramMB: profile.vramMB,
        hasNativeAudio: profile.hasNativeAudio,
        recommendedModel: profile.recommendedModel,
        enabled: modelManager.isEnabled(),
        onDeviceAllowed: sqliteAvailable,
        onDeviceBlockReason: sqliteAvailable
          ? null
          : "Local SQLite database is unavailable — run `npm run rebuild-native` in apps/electron.",
        sqliteAvailable,
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

  ipcMain.handle(IPC_CHANNELS.ON_DEVICE_GET_PLATFORM, async () => {
    try {
      const { detectHardware } = await import("../../services/on-device/hardwareDetector");
      return await detectHardware();
    } catch (err) {
      return { error: String(err) };
    }
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
    try {
      const { shutdown } = await import("../../services/on-device/ollamaLifecycle");
      await shutdown();
      const { modelManager } = await import("../../services/on-device");
      await modelManager.setEnabled(false);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ON_DEVICE_REMOVE_ASSET, async () => {
    return { success: false, error: "Individual asset removal not supported with Ollama" };
  });

  ipcMain.handle(IPC_CHANNELS.ON_DEVICE_START_SERVER, async () => {
    try {
      const { localDb, modelManager } = await import("../../services/on-device");
      const sqliteOk = localDb.isAvailable() || (await localDb.tryOpen());
      if (!sqliteOk) {
        return {
          success: false,
          error:
            "Local SQLite database is unavailable. Run `npm run rebuild-native` in apps/electron to recompile better-sqlite3 for Electron.",
        };
      }
      try {
        const { initialize } = await import("../../services/on-device/ollamaLifecycle");
        let lastUiPercent = -1;
        const profile = await initialize((info) => {
          const p = info.percent ?? 0;
          const shouldSend = info.phase !== "pulling" || p !== lastUiPercent;
          if (!shouldSend) return;
          lastUiPercent = p;
          if (ctx.consoleWindow && !ctx.consoleWindow.isDestroyed()) {
            ctx.consoleWindow.webContents.send(IPC_CHANNELS.ON_DEVICE_DOWNLOAD_PROGRESS, {
              assetId: "ollama",
              label: info.message,
              phase: info.phase,
              bytesDownloaded: 0,
              totalBytes: 0,
              percent: p,
            });
          }
        });
        await modelManager.setEnabled(true);
        return {
          success: true,
          model: profile.recommendedModel,
          tier: profile.tier,
        };
      } catch (startErr) {
        const { shutdown } = await import("../../services/on-device/ollamaLifecycle");
        await shutdown();
        return { success: false, error: String(startErr) };
      }
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ON_DEVICE_STOP_SERVER, async () => {
    try {
      const { shutdown } = await import("../../services/on-device/ollamaLifecycle");
      const { modelManager } = await import("../../services/on-device");
      await shutdown();
      await modelManager.setEnabled(false);
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ON_DEVICE_GET_SYSTEM_INFO, async () => {
    try {
      const { detectFullSystem } = await import("../../services/on-device/hardwareDetector");
      return await detectFullSystem();
    } catch (err) {
      return {
        cpu: "Unknown",
        ramMB: 0,
        os: "Unknown",
        gpus: [],
        platform: process.platform,
        error: String(err),
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ON_DEVICE_GET_GPU_PREFERENCE, async (_, userId: string) => {
    try {
      const { localDb } = await import("../../services/on-device");
      return localDb.getUserPreference(userId, "preferredGpu");
    } catch {
      return null;
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.ON_DEVICE_SET_GPU_PREFERENCE,
    async (_, userId: string, gpuName: string) => {
      try {
        const { localDb } = await import("../../services/on-device");
        localDb.setUserPreference(userId, "preferredGpu", gpuName);
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
}
