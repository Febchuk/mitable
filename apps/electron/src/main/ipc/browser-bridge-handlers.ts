import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@mitable/shared";
import { browserBridgeService } from "../../services/browserBridgeService";

export function registerBrowserBridgeHandlers() {
  ipcMain.handle(IPC_CHANNELS.BROWSER_BRIDGE_STATUS, () => {
    return browserBridgeService.isConnected();
  });

  ipcMain.handle(IPC_CHANNELS.BROWSER_BRIDGE_GET_INFO, () => {
    return browserBridgeService.getConnectionInfo();
  });
}
