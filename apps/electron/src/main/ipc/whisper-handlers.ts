/**
 * Whisper Setup IPC Handlers
 *
 * Exposes whisper readiness status and triggers model download
 * with progress events pushed to the renderer for the setup screen.
 */

import { ipcMain, BrowserWindow } from "electron";
import { IPC_CHANNELS } from "@mitable/shared";

export function registerWhisperHandlers() {
  ipcMain.handle(IPC_CHANNELS.WHISPER_STATUS, async () => {
    const { whisperSetupService } = await import("../../services/on-device/whisperSetupService");
    return {
      ready: whisperSetupService.ready,
      downloading: whisperSetupService.downloading,
      percent: whisperSetupService.downloadPercent,
    };
  });

  ipcMain.handle(IPC_CHANNELS.WHISPER_RUN_SETUP, async () => {
    const { whisperSetupService } = await import("../../services/on-device/whisperSetupService");
    if (whisperSetupService.ready) return { success: true };

    whisperSetupService.initialize();

    const broadcast = (event: { stage: string; percent: number; label: string }) => {
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.WHISPER_SETUP_PROGRESS, event);
        }
      });
    };

    const ok = await whisperSetupService.ensure(broadcast);
    return { success: ok };
  });
}
