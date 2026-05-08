import { IPC_CHANNELS } from "@mitable/shared";
import { ctx } from "../context";
import { authLogger } from "../loggers";
import { authManager } from "../../services/authManager";

/**
 * Restore authentication on startup:
 * 0. Local account check — if a local account is active, use it directly.
 * 1. Instant offline fallback — keychain + SQLite cache so the renderer shows
 *    the logged-in UI immediately.
 * 2. Background token refresh — restoreSession() upgrades to a fully
 *    authenticated session when the backend is reachable.
 */
export async function restoreAuthOnStartup(): Promise<void> {
  // ── Local account (primary path) ────────────────────────────────────────
  try {
    const { localDb } = await import("../../services/on-device");
    if (!localDb.isAvailable()) await localDb.initialize();

    if (localDb.isAvailable()) {
      const activeId = localDb.getUserPreference("system", "activeLocalUserId");
      if (activeId) {
        const localAccount = localDb.getLocalAccountById(activeId);
        if (localAccount) {
          ctx.currentUserContext = {
            userId: localAccount.id,
            organizationId: "local",
            role: "employee",
          };
          authLogger.info("Local account restored on startup", { userId: localAccount.id });
          return;
        }
      }
    }
  } catch (err) {
    authLogger.warn("Local account check failed:", err);
  }

  // ── @deprecated: Instant offline fallback (backend auth) ────────────────
  try {
    const { keychainService } = await import("../../services/keychainService");
    const credentials = await keychainService.findAllCredentials();
    const authCreds = credentials.filter((c) => !c.account.startsWith("inference:"));
    if (authCreds.length > 0) {
      const [orgId, userId] = authCreds[0].account.split(":");
      if (orgId && userId) {
        const { localDb } = await import("../../services/on-device");
        if (!localDb.isAvailable()) {
          await localDb.initialize();
        }
        if (localDb.isAvailable()) {
          const cachedUser = localDb.getUser(userId);
          if (cachedUser) {
            ctx.currentUserContext = {
              userId,
              organizationId: orgId,
              role: cachedUser.role,
            };
            if (cachedUser.role) {
              authManager.setUserRole(cachedUser.role);
            }
            authLogger.info("Restored identity from local SQLite cache (instant)", {
              userId,
              orgId,
            });

            const cachedOrg = localDb.getOrganization(orgId);
            const pushOfflineUser = () => {
              if (ctx.consoleWindow && !ctx.consoleWindow.isDestroyed()) {
                ctx.consoleWindow.webContents.send(IPC_CHANNELS.AUTH_OFFLINE_USER, {
                  id: cachedUser.id,
                  email: cachedUser.email,
                  firstName: cachedUser.firstName || "",
                  lastName: cachedUser.lastName || "",
                  role: cachedUser.role || "employee",
                  organizationId: orgId,
                  organizationName: cachedOrg?.name || "",
                  avatarUrl: cachedUser.avatarUrl || null,
                });
                authLogger.info("Pushed offline user identity to renderer");
              }
            };
            if (ctx.consoleWindow && !ctx.consoleWindow.isDestroyed()) {
              if (ctx.consoleWindow.webContents.isLoading()) {
                ctx.consoleWindow.webContents.once("did-finish-load", pushOfflineUser);
              } else {
                pushOfflineUser();
              }
            }
          } else {
            authLogger.info("Keychain has credentials but no cached user in SQLite", {
              userId,
              orgId,
            });
          }
        }
      }
    }
  } catch (err) {
    authLogger.warn("Instant offline identity check failed:", err);
  }

  // ── Background token refresh ──────────────────────────────────────────────
  authManager
    .restoreSession()
    .then((restored) => {
      if (restored) {
        authLogger.info("Session restored from keychain on startup", {
          userId: restored.userId,
          orgId: restored.organizationId,
        });

        ctx.authTokens.accessToken = restored.accessToken;
        ctx.authTokens.refreshToken = restored.refreshToken;

        ctx.currentUserContext = {
          userId: restored.userId,
          organizationId: restored.organizationId,
        };

        // BYOK keys are managed locally via keyVault — no backend fetch needed

        const pushTokensToConsole = () => {
          if (ctx.consoleWindow && !ctx.consoleWindow.isDestroyed()) {
            ctx.consoleWindow.webContents.send(IPC_CHANNELS.AUTH_SESSION_RESTORED, {
              accessToken: restored.accessToken,
              refreshToken: restored.refreshToken,
            });
            authLogger.info("Restored tokens pushed to console renderer");
          }
        };
        if (ctx.consoleWindow && !ctx.consoleWindow.isDestroyed()) {
          if (ctx.consoleWindow.webContents.isLoading()) {
            ctx.consoleWindow.webContents.once("did-finish-load", pushTokensToConsole);
          } else {
            pushTokensToConsole();
          }
        }
      } else if (!ctx.currentUserContext) {
        authLogger.info("No cached identity — user will need to log in");
      }
    })
    .catch((error) => {
      authLogger.error("Background session restore failed:", error);
    });
}
