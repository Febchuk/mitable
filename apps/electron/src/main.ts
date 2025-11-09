import { app, BrowserWindow, globalShortcut, ipcMain, screen, shell } from "electron";
import { join } from "path";
import { IPC_CHANNELS } from "@mitable/shared";
import {
  captureService,
  CaptureOptions,
  CaptureResult,
  ConversationContext,
} from "./services/captureService";

// Window references
let agentWindow: BrowserWindow | null = null;
let conversationWindow: BrowserWindow | null = null;
let consoleWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
// eslint-disable-next-line prefer-const
let guideWindow: BrowserWindow | null = null; // Not reassigned yet, but used in window management logic
let nudgeWindow: BrowserWindow | null = null;

// API Configuration
const API_BASE_URL = process.env.VITE_API_URL || "http://localhost:3000";

// Auth token storage (shared across all windows)
const authTokens: {
  accessToken: string | null;
  refreshToken: string | null;
} = {
  accessToken: null,
  refreshToken: null,
};

// PII Redaction Helper - calls backend API with authentication, retry, and timeout
async function redactPII(screenshot: string): Promise<string> {
  const MAX_RETRIES = 2;
  const TIMEOUT_MS = 30000; // 30 seconds
  const RETRY_DELAY_MS = 1000; // 1 second

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[PII] Redacting screenshot (attempt ${attempt + 1}/${MAX_RETRIES + 1})...`);

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        // Add authentication if available
        if (authTokens.accessToken) {
          headers["Authorization"] = `Bearer ${authTokens.accessToken}`;
        }

        const response = await fetch(`${API_BASE_URL}/api/pii/redact`, {
          method: "POST",
          headers,
          body: JSON.stringify({ screenshot }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text().catch(() => response.statusText);
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        console.log("[PII] Redaction complete:", {
          piiCount: data.piiCount,
          cached: data.cached,
          detectionTime: data.detectionTime,
          attempt: attempt + 1,
        });

        return data.redactedScreenshot || screenshot;
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES;
      const isTimeout = error instanceof Error && error.name === "AbortError";
      const errorMsg = error instanceof Error ? error.message : "Unknown error";

      console.error(`[PII] Redaction attempt ${attempt + 1} failed:`, errorMsg);

      if (isLastAttempt) {
        console.error("[PII] All retry attempts exhausted, returning original screenshot");
        return screenshot; // Graceful degradation
      }

      // Wait before retrying (unless it's a timeout, then retry immediately)
      if (!isTimeout) {
        console.log(`[PII] Retrying in ${RETRY_DELAY_MS}ms...`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  // This should never be reached, but TypeScript needs it
  return screenshot;
}

function createAgentWindow() {
  // Get screen dimensions for bottom-center positioning
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.bounds;
  const windowWidth = 740;
  const windowHeight = 80;
  const bottomMargin = 40;

  agentWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: Math.floor((screenWidth - windowWidth) / 2), // Center horizontally
    y: screenHeight - windowHeight - bottomMargin, // Position at bottom with margin
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/agent.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Platform-specific always-on-top behavior
  if (process.platform === "darwin") {
    agentWindow.setAlwaysOnTop(true, "modal-panel");
    agentWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    agentWindow.setAlwaysOnTop(true, "normal", 1);
  }

  // Handle external links - open in default browser/app instead of new window
  agentWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log("[Agent] External link clicked:", url);
    shell.openExternal(url).catch((err) => {
      console.error("[Agent] Failed to open external link:", err);
    });
    return { action: "deny" };
  });

  if (!app.isPackaged) {
    agentWindow.loadURL("http://localhost:5173/agent/index.html");
  } else {
    agentWindow.loadFile(join(__dirname, "../renderer/agent.html"));
  }

  // Listen for pill movement - reposition conversation in real-time
  agentWindow.on("move", () => {
    if (conversationWindow && !conversationWindow.isDestroyed() && conversationWindow.isVisible()) {
      positionConversationWindow();
    }
  });

  agentWindow.on("closed", () => {
    // Don't set to null - allow recreation via Cmd+H
    agentWindow = null;
  });
}

// Helper function to position conversation window centered above pill
function positionConversationWindow(state: "collapsed" | "expanded" = "expanded") {
  if (
    !agentWindow ||
    agentWindow.isDestroyed() ||
    !conversationWindow ||
    conversationWindow.isDestroyed()
  ) {
    return;
  }

  const pillBounds = agentWindow.getBounds();
  const conversationWidth = 740;
  const conversationHeight = state === "collapsed" ? 120 : 600; // NEW: Dynamic height
  const gap = 16;

  // Calculate centered position above pill
  const x = pillBounds.x + (pillBounds.width - conversationWidth) / 2;
  const y = pillBounds.y - conversationHeight - gap;

  conversationWindow.setBounds(
    {
      x: Math.round(x),
      y: Math.round(y),
      width: conversationWidth,
      height: conversationHeight,
    },
    true // animate: true for smooth transition
  );
}

function createConversationWindow() {
  if (!agentWindow || agentWindow.isDestroyed()) {
    console.error("[Conversation] Cannot create conversation window - agent window not available");
    return;
  }

  conversationWindow = new BrowserWindow({
    width: 740,
    height: 600,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    modal: false, // Non-modal so pill remains interactive
    webPreferences: {
      preload: join(__dirname, "../preload/conversation.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Platform-specific always-on-top behavior (same as agent)
  if (process.platform === "darwin") {
    conversationWindow.setAlwaysOnTop(true, "modal-panel");
    conversationWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    conversationWindow.setAlwaysOnTop(true, "normal", 1);
  }

  // Position conversation window initially
  positionConversationWindow();

  // Handle external links - open in default browser
  conversationWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log("[Conversation] External link clicked:", url);
    shell.openExternal(url).catch((err) => {
      console.error("[Conversation] Failed to open external link:", err);
    });
    return { action: "deny" };
  });

  if (!app.isPackaged) {
    conversationWindow.loadURL("http://localhost:5173/conversation/index.html");
  } else {
    conversationWindow.loadFile(join(__dirname, "../renderer/conversation.html"));
  }

  // Wait for renderer to be ready before allowing IPC
  conversationWindow.webContents.on("did-finish-load", () => {
    console.log("[Conversation] Renderer loaded and ready for IPC");
  });

  conversationWindow.webContents.on("dom-ready", () => {
    console.log("[Conversation] DOM ready");
  });

  conversationWindow.on("closed", () => {
    conversationWindow = null;
  });
}

function createConsoleWindow() {
  console.log("[Console] Creating console window...");
  console.log("[Console] Preload script path:", join(__dirname, "../preload/console.cjs"));

  consoleWindow = new BrowserWindow({
    width: 1264,
    height: 888,
    transparent: true,
    // Hidden title bar on macOS for native traffic lights with custom positioning
    titleBarStyle: process.platform === "darwin" ? "hidden" : "default",
    trafficLightPosition: process.platform === "darwin" ? { x: 6, y: 10 } : undefined,
    frame: process.platform !== "darwin",
    maximizable: false,
    webPreferences: {
      preload: join(__dirname, "../preload/console.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Log when preload script finishes loading
  consoleWindow.webContents.on("did-finish-load", () => {
    console.log("[Console] Window finished loading - preload script should be ready");
  });

  // Log when DOM is ready
  consoleWindow.webContents.on("dom-ready", () => {
    console.log("[Console] DOM ready - window.consoleAPI should be available now");
  });

  // Handle external links - open in default browser/app instead of new window
  consoleWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log("[Console] External link clicked:", url);

    // Open in default browser/app (e.g., Slack links open in Slack)
    shell.openExternal(url).catch((err) => {
      console.error("[Console] Failed to open external link:", err);
    });

    // Prevent Electron from creating a new window
    return { action: "deny" };
  });

  // Remove menu bar on Windows (keep on macOS for native experience)
  if (process.platform !== "darwin") {
    consoleWindow.setMenu(null);
  }

  if (!app.isPackaged) {
    console.log("[Console] Loading dev URL: http://localhost:5173/console/index.html");
    consoleWindow.loadURL("http://localhost:5173/console/index.html");
    consoleWindow.webContents.openDevTools();
  } else {
    consoleWindow.loadFile(join(__dirname, "../renderer/console.html"));
  }

  consoleWindow.on("closed", () => {
    app.quit(); // Quit app when main console window is closed
  });
}

function createOverlayWindow() {
  console.log("[Overlay] Creating overlay window...");

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;

  overlayWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: false,
    show: false,
    modal: false, // Non-modal so other windows remain interactive
    webPreferences: {
      preload: join(__dirname, "../preload/overlay.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  if (!app.isPackaged) {
    overlayWindow.loadURL("http://localhost:5173/overlay/index.html");
  } else {
    overlayWindow.loadFile(join(__dirname, "../renderer/overlay.html"));
  }

  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });
}

/**
 * DEPRECATED: Guide Window
 *
 * The guide window has been removed - all workflow UI now appears in the conversation window.
 * Previously showed step-by-step instructions in a separate floating panel.
 * Now WorkflowOptions and StepList components render directly in conversation messages.
 *
 * Kept for reference only - can be deleted after confirming new system works.
 */
// function createGuideWindow() {
//   if (!agentWindow || agentWindow.isDestroyed()) {
//     console.error("[Guide] Cannot create guide window - agent window not available");
//     return;
//   }

//   guideWindow = new BrowserWindow({
//     width: 400,
//     height: 600,
//     frame: false,
//     transparent: true,
//     alwaysOnTop: true,
//     show: false,
//     modal: false, // Non-modal so other windows remain interactive
//     webPreferences: {
//       preload: join(__dirname, "../preload/guide.cjs"),
//       contextIsolation: true,
//       nodeIntegration: false,
//     },
//   });

//   // Add platform-specific always-on-top for proper z-order
//   if (process.platform === "darwin") {
//     guideWindow.setAlwaysOnTop(true, "modal-panel");
//     guideWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
//   } else {
//     guideWindow.setAlwaysOnTop(true, "normal", 1);
//   }

//   if (!app.isPackaged) {
//     guideWindow.loadURL("http://localhost:5173/guide/index.html");
//   } else {
//     guideWindow.loadFile(join(__dirname, "../renderer/guide.html"));
//   }

//   guideWindow.on("closed", () => {
//     guideWindow = null;
//   });
// }

function createNudgeWindow() {
  if (!agentWindow || agentWindow.isDestroyed()) {
    console.error("[Nudge] Cannot create nudge window - agent window not available");
    return;
  }

  nudgeWindow = new BrowserWindow({
    width: 400,
    height: 600,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    show: false,
    modal: false, // Non-modal so other windows remain interactive
    webPreferences: {
      preload: join(__dirname, "../preload/nudge.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!app.isPackaged) {
    nudgeWindow.loadURL("http://localhost:5173/nudge/index.html");
  } else {
    nudgeWindow.loadFile(join(__dirname, "../renderer/nudge.html"));
  }

  nudgeWindow.on("closed", () => {
    nudgeWindow = null;
  });
}

// IPC Handlers
function setupIPC() {
  console.log("[IPC] Setting up IPC handlers...");

  // Agent window toggle
  ipcMain.on(IPC_CHANNELS.AGENT_TOGGLE, () => {
    if (agentWindow && !agentWindow.isDestroyed()) {
      if (agentWindow.isVisible()) {
        agentWindow.hide();
        // Also hide all dependent windows when agent is hidden
        if (conversationWindow && !conversationWindow.isDestroyed()) {
          conversationWindow.hide();
        }
        if (guideWindow && !guideWindow.isDestroyed()) {
          guideWindow.hide();
        }
        if (nudgeWindow && !nudgeWindow.isDestroyed()) {
          nudgeWindow.hide();
        }
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.hide();
        }
      } else {
        agentWindow.show();
        // Conversation window remains hidden unless explicitly shown
      }
    }
  });

  // Conversation window show - position and display (legacy - shows expanded)
  ipcMain.on(IPC_CHANNELS.CONVERSATION_SHOW, () => {
    if (conversationWindow && !conversationWindow.isDestroyed()) {
      positionConversationWindow("expanded");
      conversationWindow.show();
      // Wait for renderer to be ready before sending IPC message
      setTimeout(() => {
        // Notify renderer to switch to expanded state
        conversationWindow?.webContents.send(IPC_CHANNELS.CONVERSATION_SET_STATE, "expanded");
      }, 50); // 50ms delay to ensure renderer has processed show event
    }
  });

  // Conversation window hide
  ipcMain.on(IPC_CHANNELS.CONVERSATION_HIDE, () => {
    if (conversationWindow && !conversationWindow.isDestroyed()) {
      conversationWindow.hide();
    }
  });

  // Forward message from Agent to Conversation window
  ipcMain.on(IPC_CHANNELS.CONVERSATION_SEND_MESSAGE, (_event, messageData, screenshot) => {
    if (conversationWindow && !conversationWindow.isDestroyed()) {
      conversationWindow.webContents.send(
        IPC_CHANNELS.CONVERSATION_SEND_MESSAGE,
        messageData,
        screenshot
      );
    }
  });

  // NEW: Toggle conversation (collapsed combobox)
  ipcMain.on(IPC_CHANNELS.CONVERSATION_TOGGLE, () => {
    if (!conversationWindow || conversationWindow.isDestroyed()) return;

    const isCurrentlyVisible = conversationWindow.isVisible();
    console.log("[Main] CONVERSATION_TOGGLE called, isVisible:", isCurrentlyVisible);

    if (isCurrentlyVisible) {
      console.log("[Main] Hiding conversation window");
      conversationWindow.hide();
      // Notify renderer to switch to hidden state
      conversationWindow.webContents.send(IPC_CHANNELS.CONVERSATION_SET_STATE, "hidden");
    } else {
      console.log("[Main] Showing conversation window in collapsed state");
      positionConversationWindow("collapsed"); // 740x120
      conversationWindow.show();
      // Wait for renderer to be ready before sending IPC messages
      setTimeout(() => {
        // Notify renderer to switch to collapsed state
        conversationWindow?.webContents.send(IPC_CHANNELS.CONVERSATION_SET_STATE, "collapsed");
        // Trigger conversation list fetch
        conversationWindow?.webContents.send(IPC_CHANNELS.CONVERSATION_LIST_REQUEST);
      }, 50); // 50ms delay to ensure renderer has processed show event
    }
  });

  // NEW: Set conversation state (handles window sizing)
  ipcMain.on(
    IPC_CHANNELS.CONVERSATION_SET_STATE,
    (_event, state: "hidden" | "collapsed" | "expanded") => {
      if (!conversationWindow || conversationWindow.isDestroyed()) return;

      console.log("[Main] CONVERSATION_SET_STATE called from renderer, state:", state);

      switch (state) {
        case "hidden":
          console.log("[Main] Setting state to hidden");
          conversationWindow.hide();
          conversationWindow.webContents.send(IPC_CHANNELS.CONVERSATION_SET_STATE, "hidden");
          break;
        case "collapsed":
          console.log("[Main] Setting state to collapsed");
          positionConversationWindow("collapsed"); // 740x120
          if (!conversationWindow.isVisible()) conversationWindow.show();
          conversationWindow.webContents.send(IPC_CHANNELS.CONVERSATION_SET_STATE, "collapsed");
          break;
        case "expanded":
          console.log("[Main] Setting state to expanded");
          positionConversationWindow("expanded"); // 740x600
          if (!conversationWindow.isVisible()) conversationWindow.show();
          conversationWindow.webContents.send(IPC_CHANNELS.CONVERSATION_SET_STATE, "expanded");
          break;
      }
    }
  );

  // NEW: Open specific conversation from Console
  ipcMain.on(IPC_CHANNELS.AGENT_OPEN_CONVERSATION, (_event, conversationId: string) => {
    if (!agentWindow || agentWindow.isDestroyed()) return;
    if (!conversationWindow || conversationWindow.isDestroyed()) return;

    // Show agent if hidden
    if (!agentWindow.isVisible()) agentWindow.show();

    // Position and show conversation in expanded state
    positionConversationWindow("expanded");
    conversationWindow.show();

    // Load the specific conversation
    conversationWindow.webContents.send(IPC_CHANNELS.CONVERSATION_LOAD, conversationId);
  });

  // NEW: Open specific conversation in Console (from Agent/Conversation window)
  ipcMain.on(IPC_CHANNELS.CONSOLE_OPEN_CHAT, (_event, conversationId: string) => {
    if (!consoleWindow || consoleWindow.isDestroyed()) return;

    // Show and focus console window
    consoleWindow.show();
    consoleWindow.focus();

    // Send navigation message to console with conversation ID
    consoleWindow.webContents.send("navigate-to-chat", conversationId);

    // Hide agent and all dependent windows
    if (agentWindow && !agentWindow.isDestroyed()) {
      agentWindow.hide();
    }
    if (conversationWindow && !conversationWindow.isDestroyed()) {
      conversationWindow.hide();
    }
    if (guideWindow && !guideWindow.isDestroyed()) {
      guideWindow.hide();
    }
    if (nudgeWindow && !nudgeWindow.isDestroyed()) {
      nudgeWindow.hide();
    }
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.hide();
    }
  });

  // NEW: Handle conversation list request (fetch from backend)
  ipcMain.on(IPC_CHANNELS.CONVERSATION_LIST_REQUEST, async () => {
    if (!conversationWindow || conversationWindow.isDestroyed()) return;

    try {
      // Check if we have an auth token
      if (!authTokens.accessToken) {
        console.log("[Conversation] No auth token, returning empty list");
        conversationWindow.webContents.send(IPC_CHANNELS.CONVERSATION_LIST_RESPONSE, []);
        return;
      }

      // Fetch from backend (without messages for performance)
      const response = await fetch(`${API_BASE_URL}/api/conversations?includeMessages=false`, {
        headers: { Authorization: `Bearer ${authTokens.accessToken}` },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const conversations = await response.json();
      console.log("[Main] Fetched conversations from backend:", conversations);

      // Ensure we're sending an array (handle both direct array and object wrapper)
      const conversationList = Array.isArray(conversations)
        ? conversations
        : Array.isArray(conversations?.conversations)
          ? conversations.conversations
          : [];

      console.log(
        "[Main] Sending conversation list to renderer:",
        conversationList.length,
        "items"
      );

      // Send back to renderer
      conversationWindow.webContents.send(
        IPC_CHANNELS.CONVERSATION_LIST_RESPONSE,
        conversationList
      );
    } catch (error) {
      console.error("[Conversation] Failed to fetch conversation list:", error);
      conversationWindow.webContents.send(IPC_CHANNELS.CONVERSATION_LIST_RESPONSE, []);
    }
  });

  // Show console from agent
  ipcMain.on(IPC_CHANNELS.AGENT_SHOW_CONSOLE, () => {
    if (consoleWindow && !consoleWindow.isDestroyed()) {
      consoleWindow.show();
    }
  });

  // Minimize console window
  ipcMain.on(IPC_CHANNELS.CONSOLE_MINIMIZE, () => {
    if (consoleWindow && !consoleWindow.isDestroyed()) {
      consoleWindow.minimize();
    }
  });

  // Show overlay with bounding box data
  ipcMain.on(IPC_CHANNELS.OVERLAY_SHOW, (_event, data) => {
    console.log("[Main] OVERLAY_SHOW received with data:", data);

    if (!overlayWindow || overlayWindow.isDestroyed()) {
      console.error("[Main] Overlay window not available");
      return;
    }

    // Show overlay window first
    overlayWindow.show();
    overlayWindow.focus();

    // Open DevTools when overlay is shown (dev mode only, first time)
    if (!app.isPackaged && !overlayWindow.webContents.isDevToolsOpened()) {
      overlayWindow.webContents.openDevTools({ mode: 'detach' });
    }

    // Wait for renderer to be ready, then send data
    // If already loaded, this fires immediately
    if (overlayWindow.webContents.isLoading()) {
      console.log("[Main] Overlay still loading, waiting for did-finish-load...");
      overlayWindow.webContents.once('did-finish-load', () => {
        console.log("[Main] Overlay loaded, sending data now");
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.webContents.send("overlay-data", data);
        }
      });
    } else {
      // Already loaded, add small delay for React to mount and set up listeners
      console.log("[Main] Overlay already loaded, sending data with 100ms delay");
      setTimeout(() => {
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          overlayWindow.webContents.send("overlay-data", data);
          console.log("[Main] Overlay data sent");
        }
      }, 100);
    }

    console.log("[Main] Overlay window shown");
  });

  /**
   * DEPRECATED: Guide System IPC Handlers
   *
   * All guide-related IPC has been replaced by WorkflowOptions metadata system.
   * Guide window no longer exists - workflow UI is now inline in conversation messages.
   *
   * OLD FLOW:
   * - GUIDE_START → show guide window + overlay
   * - GUIDE_NEXT_STEP → call /guides/progress API → update guide window
   * - GUIDE_COMPLETE → hide guide window + overlay
   *
   * NEW FLOW:
   * - User clicks WorkflowOptions button in conversation window
   * - Metadata sent to /conversations/:id/messages/stream
   * - Agent service selects appropriate tool (guide_next_step, analyze_workflow_screen, etc.)
   * - Tool response streams back to conversation window (no separate guide window)
   *
   * Kept for reference - can be deleted after confirming new system works.
   */

  // // Guide system
  // ipcMain.on(IPC_CHANNELS.GUIDE_START, (_event, data) => {
  //   // Show and position overlay window
  //   if (overlayWindow && !overlayWindow.isDestroyed()) {
  //     overlayWindow.webContents.send(IPC_CHANNELS.OVERLAY_HIGHLIGHT_UPDATE, data);
  //     overlayWindow.show();
  //   }

  //   // Position and show guide window
  //   if (guideWindow && !guideWindow.isDestroyed()) {
  //     // Position on left side of screen with some margin
  //     const primaryDisplay = screen.getPrimaryDisplay();
  //     const { height: screenHeight } = primaryDisplay.bounds;
  //     const guideWidth = 400;
  //     const guideHeight = 400;

  //     guideWindow.setBounds({
  //       x: 50,
  //       y: Math.floor((screenHeight - guideHeight) / 2),
  //       width: guideWidth,
  //       height: guideHeight,
  //     });

  //     guideWindow.webContents.send(IPC_CHANNELS.GUIDE_DATA, data);
  //     guideWindow.show();
  //   }

  //   // Hide nudge window if visible
  //   if (nudgeWindow && !nudgeWindow.isDestroyed() && nudgeWindow.isVisible()) {
  //     nudgeWindow.hide();
  //   }
  // });

  // // Guide step update - forward to overlay
  // ipcMain.on(IPC_CHANNELS.GUIDE_STEP_UPDATE, (_event, data) => {
  //   if (overlayWindow && !overlayWindow.isDestroyed()) {
  //     overlayWindow.webContents.send(IPC_CHANNELS.OVERLAY_HIGHLIGHT_UPDATE, data);
  //   }
  // });

  // ipcMain.on(IPC_CHANNELS.GUIDE_COMPLETE, () => {
  //   if (overlayWindow && !overlayWindow.isDestroyed()) {
  //     overlayWindow.hide();
  //   }
  //   if (guideWindow && !guideWindow.isDestroyed()) {
  //     guideWindow.hide();
  //   }
  // });

  // // Guide next step - forward to Agent window to trigger screenshot + "Next" message
  // ipcMain.on(IPC_CHANNELS.GUIDE_NEXT_STEP, () => {
  //   if (agentWindow && !agentWindow.isDestroyed()) {
  //     console.log("[Main] Guide next step requested - forwarding to Agent window");
  //     agentWindow.webContents.send(IPC_CHANNELS.AGENT_GUIDE_NEXT_STEP);
  //   }
  // });

  // ipcMain.handle(
  //   IPC_CHANNELS.GUIDE_NEXT_STEP,
  //   async (_event, data: { conversationId: string; currentStepIndex: number }) => {
  //     console.log("[Main] Guide progress requested:", data);

  //     try {
  //       const screenshot = await captureService.capture({ mode: "full-screen" });
  //       if (!screenshot) {
  //         console.error("[Main] Screenshot capture failed");
  //         return { error: "Screenshot capture failed" };
  //       }

  //       const response = await fetch("http://localhost:3000/api/guides/progress", {
  //         method: "POST",
  //         headers: {
  //           "Content-Type": "application/json",
  //           Authorization: `Bearer ${authTokens.accessToken}`,
  //         },
  //         body: JSON.stringify({
  //           conversationId: data.conversationId,
  //           screenshot: screenshot.dataUrl,
  //           currentStepIndex: data.currentStepIndex,
  //         }),
  //       });

  //       const result = await response.json();

  //       // Update the guide window with the new step
  //       if (guideWindow && !guideWindow.isDestroyed()) {
  //         guideWindow.webContents.send(IPC_CHANNELS.GUIDE_STEP_UPDATE, result);
  //       }

  //       // Forward the conversational message to the conversation window
  //       // This displays the step guidance in the chat
  //       if (conversationWindow && !conversationWindow.isDestroyed() && result.visualGuidance) {
  //         conversationWindow.webContents.send(
  //           IPC_CHANNELS.CONVERSATION_SEND_MESSAGE,
  //           {
  //             message: result.visualGuidance.conversationalMessage,
  //             conversationId: data.conversationId,
  //             messageType: "workflow",
  //             cardData: result.adjustedSolution,
  //           },
  //           null  // screenshot parameter (null for step 2+)
  //         );
  //       }

  //       console.log("[Main] Guide progress complete:", {
  //         adjusted: result.adjustmentMade,
  //         currentStep: result.adjustedSolution?.currentStepIndex,
  //       });

  //       return result;
  //     } catch (error) {
  //       console.error("[Main] Guide progress error:", error);
  //       return { error: "Failed to progress guide" };
  //     }
  //   }
  // );

  // Nudge system
  ipcMain.on(IPC_CHANNELS.NUDGE_SHOW, (_event, data) => {
    if (nudgeWindow && !nudgeWindow.isDestroyed()) {
      // Position nudge window to the right of agent window
      if (agentWindow && !agentWindow.isDestroyed()) {
        const agentBounds = agentWindow.getBounds();
        const nudgeBounds = nudgeWindow.getBounds();

        // Position to the right with 16px gap
        const x = agentBounds.x + agentBounds.width + 16;
        const y = agentBounds.y;

        nudgeWindow.setBounds({
          x,
          y,
          width: nudgeBounds.width,
          height: nudgeBounds.height,
        });
      }

      nudgeWindow.webContents.send(IPC_CHANNELS.NUDGE_SHOW, data);
      nudgeWindow.show();
    }
    if (guideWindow && !guideWindow.isDestroyed() && guideWindow.isVisible()) {
      guideWindow.hide();
    }
  });

  // Nudge creation request - from nudge window to console
  ipcMain.on(IPC_CHANNELS.NUDGE_CREATE_REQUEST, (_event, data) => {
    console.log("[Nudge] Create request received:", data);

    // Show and focus console window
    if (consoleWindow && !consoleWindow.isDestroyed()) {
      consoleWindow.show();
      consoleWindow.focus();

      // Forward nudge creation data to console
      // Console will navigate to /nudges/new and populate the form
      consoleWindow.webContents.send(IPC_CHANNELS.NUDGE_OPEN_CREATOR, data);
    }

    // Hide nudge window after triggering creation
    if (nudgeWindow && !nudgeWindow.isDestroyed()) {
      nudgeWindow.hide();
    }
  });

  // NEW: Direct nudge creation from conversation window (inline expert cards)
  ipcMain.on(IPC_CHANNELS.OPEN_CONSOLE_NUDGE_FORM, (_event, data) => {
    console.log("[Main] Opening Console nudge form with inline expert data:", data);

    // Show and focus console window
    if (consoleWindow && !consoleWindow.isDestroyed()) {
      consoleWindow.show();
      consoleWindow.focus();

      // Forward nudge creation data to console
      // Console will navigate to /nudges/new and populate the form
      consoleWindow.webContents.send(IPC_CHANNELS.NUDGE_OPEN_CREATOR, data);
    } else {
      console.error("[Main] Console window not available for nudge form");
    }
  });

  // Dynamic mouse events for overlay
  ipcMain.on(IPC_CHANNELS.SET_IGNORE_MOUSE_EVENTS, (_event, ignore: boolean) => {
    if (agentWindow && !agentWindow.isDestroyed()) {
      agentWindow.setIgnoreMouseEvents(ignore, { forward: true });
    }
    if (guideWindow && !guideWindow.isDestroyed()) {
      guideWindow.setIgnoreMouseEvents(ignore, { forward: true });
    }
    if (nudgeWindow && !nudgeWindow.isDestroyed()) {
      nudgeWindow.setIgnoreMouseEvents(ignore, { forward: true });
    }
  });

  // Agent window resize with upward expansion and centered positioning
  ipcMain.on(
    IPC_CHANNELS.AGENT_RESIZE,
    (
      _event,
      options:
        | { width?: number; height?: number }
        | "pill"
        | "conversation"
        | "text-mode"
        | "audio-mode"
    ) => {
      if (agentWindow && !agentWindow.isDestroyed()) {
        const currentBounds = agentWindow.getBounds();

        // Support both legacy mode strings and new flexible options
        let newWidth: number;
        let newHeight: number;

        if (typeof options === "string") {
          // Legacy mode parameter
          switch (options) {
            case "pill":
              newWidth = 740;
              newHeight = 80;
              break;
            case "conversation":
              newWidth = 740;
              newHeight = 696;
              break;
            case "text-mode":
              newWidth = 740;
              newHeight = currentBounds.height;
              break;
            case "audio-mode":
              newWidth = 280;
              newHeight = currentBounds.height;
              break;
            default:
              newWidth = currentBounds.width;
              newHeight = currentBounds.height;
          }
        } else {
          // New flexible options format
          newWidth = options.width ?? currentBounds.width;
          newHeight = options.height ?? currentBounds.height;
        }

        // Calculate new X position to keep centered horizontally (expand/shrink from center)
        const widthDiff = newWidth - currentBounds.width;
        const newX = currentBounds.x - widthDiff / 2;

        // Calculate new Y position to keep bottom edge fixed (expand/shrink upward)
        const heightDiff = newHeight - currentBounds.height;
        const newY = currentBounds.y - heightDiff;

        agentWindow.setBounds(
          {
            x: Math.round(newX),
            y: Math.round(newY),
            width: newWidth,
            height: newHeight,
          },
          true // animate
        );

        // Reposition conversation window if visible (maintains alignment)
        if (
          conversationWindow &&
          !conversationWindow.isDestroyed() &&
          conversationWindow.isVisible()
        ) {
          positionConversationWindow();
        }
      }
    }
  );

  // Nudge window resize with left-to-right expansion
  ipcMain.on(
    IPC_CHANNELS.NUDGE_RESIZE,
    (_event, options: { width?: number; height?: number } | "collapsed" | "expanded") => {
      if (nudgeWindow && !nudgeWindow.isDestroyed()) {
        const currentBounds = nudgeWindow.getBounds();

        // Support both mode strings and flexible options
        let newWidth: number;
        let newHeight: number;

        if (typeof options === "string") {
          // Mode-based resizing
          switch (options) {
            case "collapsed":
              newWidth = 85;
              newHeight = 400;
              break;
            case "expanded":
              newWidth = 380;
              newHeight = 400;
              break;
            default:
              newWidth = currentBounds.width;
              newHeight = currentBounds.height;
          }
        } else {
          // Flexible options format
          newWidth = options.width ?? currentBounds.width;
          newHeight = options.height ?? currentBounds.height;
        }

        // Left-to-right expansion: keep X position fixed (left edge anchored)
        // Only adjust Y if height changes (keep vertical center)
        const heightDiff = newHeight - currentBounds.height;
        const newY = currentBounds.y - heightDiff / 2;

        nudgeWindow.setBounds(
          {
            x: currentBounds.x, // Left edge stays fixed
            y: Math.round(newY),
            width: newWidth,
            height: newHeight,
          },
          true // animate
        );
      }
    }
  );

  // Auth Management - Cross-window token sharing
  // Console sets tokens after login
  ipcMain.on(IPC_CHANNELS.AUTH_SET_TOKENS, (_event, accessToken: string, refreshToken: string) => {
    console.log("[Auth] Tokens set from Console window");
    authTokens.accessToken = accessToken;
    authTokens.refreshToken = refreshToken;

    // Broadcast token update to all windows
    const allWindows = [agentWindow, conversationWindow, guideWindow, nudgeWindow, overlayWindow];
    allWindows.forEach((win) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.AUTH_TOKEN_UPDATED, accessToken);
      }
    });
  });

  // Any window can request current auth token
  ipcMain.handle(IPC_CHANNELS.AUTH_GET_TOKEN, () => {
    console.log("[Auth] Token requested, returning:", authTokens.accessToken ? "present" : "null");
    return authTokens.accessToken;
  });

  // Console clears tokens on logout
  ipcMain.on(IPC_CHANNELS.AUTH_CLEAR, () => {
    console.log("[Auth] Tokens cleared");
    authTokens.accessToken = null;
    authTokens.refreshToken = null;

    // Broadcast token clear to all windows
    const allWindows = [agentWindow, conversationWindow, guideWindow, nudgeWindow, overlayWindow];
    allWindows.forEach((win) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.AUTH_TOKEN_UPDATED, null);
      }
    });
  });

  // Screenshot Capture - using enhanced CaptureService with conditional capture
  ipcMain.handle(
    IPC_CHANNELS.CAPTURE_SCREENSHOT,
    async (
      _event,
      payload?: {
        options?: CaptureOptions;
        message?: string;
        context?: ConversationContext;
      }
    ): Promise<Pick<CaptureResult, "dataUrl" | "metadata"> | null> => {
      console.log("[Screenshot] IPC handler called", {
        hasMessage: !!payload?.message,
        hasContext: !!payload?.context,
        options: payload?.options,
      });

      try {
        // If message and context provided, use conditional capture (heuristics)
        if (payload?.message && payload?.context) {
          console.log("[Screenshot] Using conditional capture with heuristics");
          const { decision, result } = await captureService.conditionalCapture(
            payload.message,
            payload.context,
            payload.options || { mode: "full-screen" }
          );

          console.log("[Screenshot] Conditional capture decision:", {
            shouldCapture: decision.shouldCapture,
            confidence: decision.confidence,
            reason: decision.reason,
          });

          if (!result) {
            console.log("[Screenshot] No screenshot captured (heuristics determined not needed)");
            return null;
          }

          console.log("[Screenshot] Screenshot captured via heuristics:", {
            mode: result.metadata.captureMode,
            width: result.metadata.width,
            height: result.metadata.height,
          });

          // Redact PII before returning
          const redactedDataUrl = await redactPII(result.dataUrl);

          return {
            dataUrl: redactedDataUrl,
            metadata: result.metadata,
          };
        }

        // Fallback: unconditional capture (legacy behavior)
        console.log("[Screenshot] Using unconditional capture (no heuristics)");
        const result = await captureService.capture(payload?.options || { mode: "full-screen" });

        if (!result) {
          console.error("[Screenshot] Capture failed - no result returned");
          return null;
        }

        console.log("[Screenshot] Capture successful:", {
          mode: result.metadata.captureMode,
          width: result.metadata.width,
          height: result.metadata.height,
        });

        // Redact PII before returning
        const redactedDataUrl = await redactPII(result.dataUrl);

        // Return both data URL and metadata (omit filePath for security)
        return {
          dataUrl: redactedDataUrl,
          metadata: result.metadata,
        };
      } catch (error) {
        console.error("[Screenshot] Capture failed with error:", error);
        return null;
      }
    }
  );

  // Display Metadata - for multi-monitor support
  ipcMain.handle(IPC_CHANNELS.GET_DISPLAY_METADATA, () => {
    const displays = screen.getAllDisplays();
    return displays.map((display) => ({
      bounds: display.bounds,
      scaleFactor: display.scaleFactor,
    }));
  });

  console.log("[IPC] Screenshot capture and display metadata handlers registered successfully");
}

// Global shortcut for help (Cmd+H / Ctrl+H)
function registerGlobalShortcuts() {
  globalShortcut.register("CommandOrControl+H", () => {
    if (!agentWindow || agentWindow.isDestroyed()) {
      // Recreate window if it was closed
      createAgentWindow();
    }
    if (agentWindow && !agentWindow.isDestroyed()) {
      if (agentWindow.isVisible()) {
        agentWindow.hide();
      } else {
        agentWindow.show();
        agentWindow.focus();
      }
    }
  });
}

app.whenReady().then(() => {
  createAgentWindow();
  createConversationWindow(); // Create conversation window as child of agent
  createConsoleWindow();
  // DEPRECATED: Guide window no longer needed - workflow UI moved to conversation window
  // createGuideWindow(); // Create guide as child of agent
  createOverlayWindow(); // Create overlay for bounding box visual guidance
  createNudgeWindow(); // Create nudge as child of agent

  setupIPC();
  registerGlobalShortcuts();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
