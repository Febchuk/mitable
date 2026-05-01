import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@mitable/shared";
import { ctx } from "../context";
import { authLogger } from "../loggers";
import { authManager } from "../../services/authManager";
import { trackMainEvent } from "../../services/analyticsService";

export function registerAuthHandlers() {
  ipcMain.on(IPC_CHANNELS.AUTH_SET_TOKENS, (_event, accessToken: string, refreshToken: string) => {
    if (typeof accessToken !== "string" || typeof refreshToken !== "string") {
      authLogger.warn("AUTH_SET_TOKENS rejected: tokens must be strings");
      return;
    }
    if (accessToken.length > 10_000 || refreshToken.length > 10_000) {
      authLogger.warn("AUTH_SET_TOKENS rejected: token exceeds max length (10000)");
      return;
    }

    authLogger.info(" Tokens received from Console window", {
      hasAccessToken: !!accessToken,
      accessTokenLength: accessToken?.length || 0,
      hasRefreshToken: !!refreshToken,
    });

    ctx.authTokens.accessToken = accessToken;
    ctx.authTokens.refreshToken = refreshToken;

    const userCtx = ctx.currentUserContext
      ? { orgId: ctx.currentUserContext.organizationId, userId: ctx.currentUserContext.userId }
      : undefined;

    authManager.setTokens(accessToken, refreshToken, userCtx).then(() => {
      authLogger.info(" Auth manager token state after sync:", {
        managerHasToken: !!authManager.getAccessToken(),
        persistedToKeychain: !!userCtx,
      });
    });

    const allWindows = [ctx.consoleWindow, ctx.watchingPillWindow];
    allWindows.forEach((win) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.AUTH_TOKEN_UPDATED, accessToken);
      }
    });
  });

  ipcMain.handle(IPC_CHANNELS.AUTH_GET_TOKEN, () => {
    authLogger.info(
      " Token requested, returning:",
      ctx.authTokens.accessToken ? "present" : "null"
    );
    return ctx.authTokens.accessToken;
  });

  ipcMain.on(IPC_CHANNELS.AUTH_CLEAR, async () => {
    authLogger.info(" Tokens cleared");
    ctx.authTokens.accessToken = null;
    ctx.authTokens.refreshToken = null;

    const userCtx = ctx.currentUserContext
      ? { orgId: ctx.currentUserContext.organizationId, userId: ctx.currentUserContext.userId }
      : undefined;

    await authManager.clearTokens(userCtx);
    authLogger.info(" Auth manager and keychain cleared");

    if (ctx.currentUserContext?.userId) {
      trackMainEvent(ctx.currentUserContext.userId, "electron_auth_cleared");
    }
    ctx.currentUserContext = null;

    const allWindows = [ctx.consoleWindow, ctx.watchingPillWindow];
    allWindows.forEach((win) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.AUTH_TOKEN_UPDATED, null);
      }
    });
  });
}
