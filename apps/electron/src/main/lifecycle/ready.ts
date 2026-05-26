import { IPC_CHANNELS } from "@mitable/shared";
import { app, session } from "electron";
import { join } from "path";
import { ctx } from "../context";
import { authLogger, consoleLogger, notificationLogger, recoveryLogger } from "../loggers";
import { initActiveWindowBridge } from "../activeWindowBridge";
import { createConsoleWindow } from "../windows/console-window";
import { createTrayIfSupported, showConsoleWindow } from "../tray";
import { registerGlobalShortcuts } from "../shortcuts";
import { initOnDeviceAI, eagerPreloadModels } from "./on-device-init";
import { restoreAuthOnStartup } from "./startup-auth";
import { initAnalytics, trackMainEvent } from "../../services/analyticsService";
import { browserBridgeService } from "../../services/browserBridgeService";
import { monitoringSessionService } from "../../services/monitoringSessionService";
import { authManager } from "../../services/authManager";
import { startNotificationTimer } from "../notifications/nudge-timer";

export interface AppReadyOptions {
  registerAllIpc: () => void;
  handleNotificationAction: (actionId: string) => void;
}

/**
 * Main orchestrator for `app.whenReady()`.
 * Sets up permissions, enforces single instance, initialises analytics,
 * wires CSP, creates windows, registers shortcuts/IPC, and kicks off
 * background services (on-device AI, browser bridge, auth restore, updates).
 */
export async function onAppReady(opts: AppReadyOptions): Promise<void> {
  // ── Media permissions ─────────────────────────────────────────────────────
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ["media", "mediaKeySystem", "geolocation", "notifications"];
    callback(allowed.includes(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === "media";
  });

  // ── Single Instance Lock ──────────────────────────────────────────────────
  const lockData = { mode: app.isPackaged ? "production" : "development" };
  const gotTheLock = app.requestSingleInstanceLock(lockData);
  if (!gotTheLock) {
    consoleLogger.info(" Another instance is already running. Quitting...");
    app.quit();
    return;
  }

  if (!app.isPackaged) {
    app.setName("Mitable Dev");
    app.setPath("userData", join(app.getPath("appData"), "@mitable-dev", "electron"));
  }

  // ── Analytics ─────────────────────────────────────────────────────────────
  initAnalytics();
  trackMainEvent("anonymous", "electron_app_launched", {
    version: app.getVersion(),
    arch: process.arch,
    is_packaged: app.isPackaged,
  });

  // ── App User Model ID (Windows notifications) ────────────────────────────
  if (process.platform === "win32") {
    app.setAppUserModelId(app.isPackaged ? "com.mitable.app" : "com.mitable.dev");
  }

  // ── Second instance handler ───────────────────────────────────────────────
  app.on("second-instance", (_event, commandLine) => {
    const protocolUrl = commandLine.find((arg) => arg.startsWith("mitable://"));
    if (protocolUrl) {
      const actionId = protocolUrl.replace("mitable://", "").replace(/\/$/, "");
      notificationLogger.info("Protocol action received:", actionId);
      opts.handleNotificationAction(actionId);
      return;
    }

    showConsoleWindow();
  });

  // ── Active window bridge ──────────────────────────────────────────────────
  initActiveWindowBridge();

  // ── Content Security Policy ───────────────────────────────────────────────
  const isDev = !app.isPackaged;
  const scriptSrc = isDev
    ? " script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* ws://localhost:*;"
    : " script-src 'self';";
  const connectSrc =
    " connect-src 'self'" +
    " https://*.mitable.ai https://*.supabase.co wss://*.supabase.co" +
    " https://*.up.railway.app" +
    " https://*.posthog.com https://*.deepgram.com wss://*.deepgram.com" +
    " https://generativelanguage.googleapis.com https://api.openai.com" +
    " https://api.groq.com https://api.anthropic.com" +
    (isDev ? " http://localhost:* ws://localhost:*" : "") +
    ";";

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self';" +
            scriptSrc +
            " style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;" +
            " img-src 'self' data: https: blob:;" +
            " font-src 'self' data: https://fonts.gstatic.com;" +
            connectSrc +
            " media-src 'self' blob:;" +
            " worker-src 'self' blob:;",
        ],
      },
    });
  });

  // ── Windows, tray, IPC, shortcuts ─────────────────────────────────────────
  createConsoleWindow();
  createTrayIfSupported();
  opts.registerAllIpc();
  registerGlobalShortcuts();

  // ── On-device AI ──────────────────────────────────────────────────────────
  await initOnDeviceAI();

  // Initialize whisper paths (actual download/setup is triggered by the SetupPage)
  import("../../services/on-device/whisperSetupService")
    .then(({ whisperSetupService }) => {
      whisperSetupService.initialize();
      consoleLogger.info("[Startup] WhisperSetupService initialized (paths ready)");
    })
    .catch((err) => {
      consoleLogger.error("[Startup] WhisperSetupService init error:", String(err));
    });

  eagerPreloadModels().catch((err) => {
    consoleLogger.error("[EagerPreload] Background preload failed:", err);
  });

  // ── Browser Bridge ────────────────────────────────────────────────────────
  browserBridgeService.start().catch((err) => {
    consoleLogger.error("Failed to start BrowserBridgeService:", err);
  });

  browserBridgeService.onConnectionChange((connected) => {
    if (ctx.consoleWindow && !ctx.consoleWindow.isDestroyed()) {
      ctx.consoleWindow.webContents.send(IPC_CHANNELS.BROWSER_BRIDGE_CONNECTION_UPDATE, connected);
    }
  });

  // ── Auth restore ──────────────────────────────────────────────────────────
  if (!app.isPackaged) {
    const backendUrl = process.env.VITE_API_URL || "http://localhost:3000";
    authLogger.info(`Checking for backend at ${backendUrl}/health (non-blocking)…`);
    fetch(`${backendUrl}/health`, { signal: AbortSignal.timeout(5000) })
      .then((res) => {
        if (res.ok) authLogger.info("Backend is reachable");
      })
      .catch(() => {
        authLogger.info("Backend not reachable — running in local-only mode");
      });
  }

  await restoreAuthOnStartup();

  // ── Periodic services ─────────────────────────────────────────────────────
  // @deprecated updateService removed — no backend for auto-updates
  startNotificationTimer();

  // ── Stale session cleanup (cloud-only, best-effort) ───────────────────────
  try {
    if (authManager.getAccessToken()) {
      authManager
        .authenticatedFetch("/api/monitoring/sessions/cleanup-stale", { method: "POST" })
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            if (data.sessionsEnded > 0) {
              recoveryLogger.info(`Auto-ended ${data.sessionsEnded} stale cloud session(s)`);
            }
          }
        })
        .catch(() => {
          /* offline — no-op */
        });
    }
  } catch {
    // non-fatal
  }

  // ── Crash recovery ────────────────────────────────────────────────────────
  try {
    const recoverableSessions = await monitoringSessionService.getRecoverableSessions(
      ctx.currentUserContext?.userId
    );
    if (recoverableSessions.length > 0) {
      recoveryLogger.info(` Found ${recoverableSessions.length} recoverable session(s)`);
      setTimeout(() => {
        if (ctx.consoleWindow && !ctx.consoleWindow.isDestroyed()) {
          ctx.consoleWindow.webContents.send(
            IPC_CHANNELS.SESSION_SHOW_RECOVERY_DIALOG,
            recoverableSessions
          );
        }
      }, 2000);
    }
  } catch (error) {
    recoveryLogger.error(" Error checking for recoverable sessions:", error);
  }
}
