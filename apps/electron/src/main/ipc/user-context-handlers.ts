import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@mitable/shared";
import { ctx } from "../context";
import { authLogger, consoleLogger } from "../loggers";
import { authManager } from "../../services/authManager";
import { identifyMainUser } from "../../services/analyticsService";

export function registerUserContextHandlers() {
  ipcMain.on(
    IPC_CHANNELS.USER_CONTEXT_SET,
    (
      _event,
      user: {
        userId: string;
        organizationId: string;
        role?: string;
        email?: string;
        firstName?: string;
        lastName?: string;
        avatarUrl?: string;
        jobTitle?: string;
        organizationName?: string;
        organizationDomain?: string;
      }
    ) => {
      consoleLogger.info(" Set:", { userId: user.userId, organizationId: user.organizationId });
      ctx.currentUserContext = user;

      identifyMainUser(user.userId, {
        organizationId: user.organizationId,
        role: user.role,
      });

      if (user.role) {
        authManager.setUserRole(user.role);
      }

      import("../../services/on-device")
        .then(({ localDb }) => {
          if (!localDb.isAvailable()) return;
          localDb.upsertOrganization({
            id: user.organizationId,
            name: user.organizationName || "",
            domain: user.organizationDomain ?? null,
            settings: "{}",
          });
          localDb.upsertUser({
            id: user.userId,
            organizationId: user.organizationId,
            email: user.email || "",
            firstName: user.firstName ?? null,
            lastName: user.lastName ?? null,
            role: user.role || "member",
            avatarUrl: user.avatarUrl ?? null,
            status: "active",
            jobTitle: user.jobTitle ?? null,
          });
          authLogger.info("User identity cached to local SQLite");
        })
        .catch((err) => {
          authLogger.warn("Failed to cache identity to local SQLite:", err);
        });

      const refreshTok = ctx.authTokens.refreshToken ?? authManager.getRefreshToken();
      const accessTok = ctx.authTokens.accessToken ?? authManager.getAccessToken();
      if (refreshTok && accessTok) {
        authManager
          .setTokens(accessTok, refreshTok, {
            orgId: user.organizationId,
            userId: user.userId,
          })
          .then(() => {
            authLogger.info("Refresh token persisted to keychain after user context set");
          });
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.USER_CONTEXT_GET, () => {
    return ctx.currentUserContext;
  });
}
