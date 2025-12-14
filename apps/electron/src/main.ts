import type { MultiWindowCaptureResult, SelectedWindowInfo } from "@mitable/shared";
import { IPC_CHANNELS } from "@mitable/shared";
import { app, BrowserWindow, globalShortcut, ipcMain, screen, shell } from "electron";
import { join } from "path";
import { initActiveWindowBridge } from "./main/activeWindowBridge";
import { isBlockedByPolicy } from "./services/capturePolicy";
import { captureService } from "./services/captureService";
import { resolveWindowUrlForWatchSelection } from "./services/macWindowFocusService";
import { windowDetectionService } from "./services/windowDetectionService";

// Window references
let agentWindow: BrowserWindow | null = null;
let agentPanelWindow: BrowserWindow | null = null;
let conversationWindow: BrowserWindow | null = null;
let consoleWindow: BrowserWindow | null = null;
let updatePromptWindow: BrowserWindow | null = null;
let watchingPillWindow: BrowserWindow | null = null;

// Watch button windows tracking (module scope for cleanup from multiple handlers)
const watchButtonWindows: Map<string, BrowserWindow> = new Map();

// Auth token storage (shared across all windows)
const authTokens: {
  accessToken: string | null;
  refreshToken: string | null;
} = {
  accessToken: null,
  refreshToken: null,
};

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
    agentWindow.loadFile(join(__dirname, "../renderer/agent/index.html"));
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
    conversationWindow.loadFile(join(__dirname, "../renderer/conversation/index.html"));
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

function createAgentPanelWindow() {
  // Get screen dimensions for right-docked positioning
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.bounds;
  const panelWidth = 450;

  agentPanelWindow = new BrowserWindow({
    width: panelWidth,
    height: screenHeight,
    x: screenWidth - panelWidth, // Right edge of screen
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    show: false, // Hidden by default
    // Vibrancy is controlled dynamically for animation coordination
    // but keep active so vibrancy is available for animation
    visualEffectState: "active" as const,
    // Window starts transparent, vibrancy fades in after content animation
    ...(process.platform === "win32" && {
      backgroundMaterial: "acrylic" as const,
    }),
    webPreferences: {
      preload: join(__dirname, "../preload/agentpanel.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Platform-specific always-on-top behavior
  if (process.platform === "darwin") {
    agentPanelWindow.setAlwaysOnTop(true, "modal-panel");
    agentPanelWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    agentPanelWindow.setAlwaysOnTop(true, "normal", 1);
  }

  // Handle external links
  agentPanelWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log("[AgentPanel] External link clicked:", url);
    shell.openExternal(url).catch((err) => {
      console.error("[AgentPanel] Failed to open external link:", err);
    });
    return { action: "deny" };
  });

  if (!app.isPackaged) {
    agentPanelWindow.loadURL("http://localhost:5173/agentpanel/index.html");
  } else {
    agentPanelWindow.loadFile(join(__dirname, "../renderer/agentpanel/index.html"));
  }

  agentPanelWindow.webContents.on("did-finish-load", () => {
    console.log("[AgentPanel] Window finished loading");
  });

  agentPanelWindow.on("closed", () => {
    agentPanelWindow = null;
  });
}

function createConsoleWindow() {
  console.log("[Console] Creating console window...");
  console.log("[Console] Preload script path:", join(__dirname, "../preload/console.cjs"));

  consoleWindow = new BrowserWindow({
    width: 1264,
    height: 888,
    transparent: true,
    backgroundColor: "#00000000", // Fully transparent hex for vibrancy support
    // Hidden title bar on macOS for native traffic lights with custom positioning
    titleBarStyle: process.platform === "darwin" ? "hidden" : "default",
    frame: process.platform !== "darwin",
    maximizable: false,
    // Native frosted glass - platform specific
    ...(process.platform === "darwin" && {
      vibrancy: "under-window" as const,
      visualEffectState: "active" as const,
    }),
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
    consoleWindow.loadFile(join(__dirname, "../renderer/console/index.html"));
  }

  consoleWindow.on("closed", () => {
    app.quit(); // Quit app when main console window is closed
  });
}

function createUpdatePromptWindow() {
  // Get screen dimensions for top-right positioning
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.bounds;

  const windowWidth = 360;
  const windowHeight = 140;
  const topMargin = 20; // Higher up on screen
  const rightMargin = 5; // Flush to right edge

  updatePromptWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: screenWidth - windowWidth - rightMargin,
    y: topMargin,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/updatePrompt.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Platform-specific always-on-top behavior
  if (process.platform === "darwin") {
    updatePromptWindow.setAlwaysOnTop(true, "modal-panel");
    updatePromptWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    updatePromptWindow.setAlwaysOnTop(true, "normal", 1);
  }

  if (!app.isPackaged) {
    updatePromptWindow.loadURL("http://localhost:5173/updatePrompt/index.html");
  } else {
    updatePromptWindow.loadFile(join(__dirname, "../renderer/updatePrompt/index.html"));
  }

  updatePromptWindow.on("closed", () => {
    updatePromptWindow = null;
  });

  console.log("[UpdatePrompt] Window created at top-right position");
}

function createWatchingPillWindow() {
  // Get screen dimensions for right-edge, vertically centered positioning
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.bounds;

  const windowWidth = 130; // Wide enough for dropdown options
  const windowHeight = 160; // Tall enough for pill + dropdown
  const rightMargin = 5;

  watchingPillWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: screenWidth - windowWidth - rightMargin,
    y: Math.floor((screenHeight - windowHeight) / 2),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/watchingPill.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Platform-specific always-on-top behavior
  if (process.platform === "darwin") {
    watchingPillWindow.setAlwaysOnTop(true, "modal-panel");
    watchingPillWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    watchingPillWindow.setAlwaysOnTop(true, "normal", 1);
  }

  if (!app.isPackaged) {
    watchingPillWindow.loadURL("http://localhost:5173/watchingPill/index.html");
  } else {
    watchingPillWindow.loadFile(join(__dirname, "../renderer/watchingPill/index.html"));
  }

  watchingPillWindow.on("closed", () => {
    watchingPillWindow = null;
  });

  console.log("[WatchingPill] Window created at right edge, vertically centered");
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

    // Close all watch button windows when message is sent
    // This prevents visual clutter after user submits help request
    closeAllWatchButtonWindows(watchButtonWindows);
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
  });

  // NEW: Open Chats tab in Console (from Agent Panel)
  ipcMain.on(IPC_CHANNELS.CONSOLE_OPEN_CHATS, () => {
    if (!consoleWindow || consoleWindow.isDestroyed()) return;

    // Show and focus console window
    consoleWindow.show();
    consoleWindow.focus();

    // Send navigation message to console to open chats tab
    consoleWindow.webContents.send("navigate-to-chats");
  });

  // ==================== Agent Panel IPC Handlers ====================

  // Toggle Agent Panel visibility
  ipcMain.on(IPC_CHANNELS.AGENTPANEL_TOGGLE, () => {
    if (agentPanelWindow && !agentPanelWindow.isDestroyed()) {
      if (agentPanelWindow.isVisible()) {
        agentPanelWindow.hide();
      } else {
        // Apply vibrancy FIRST (synchronously) before showing - fixes production transparency issue
        if (process.platform === "darwin") {
          agentPanelWindow.setVibrancy("under-window");
        }
        agentPanelWindow.show();
        // Notify renderer for entrance animation
        agentPanelWindow.webContents.send(IPC_CHANNELS.AGENTPANEL_SHOWN);
      }
    }
  });

  // Show Agent Panel
  ipcMain.on(IPC_CHANNELS.AGENTPANEL_SHOW, () => {
    if (agentPanelWindow && !agentPanelWindow.isDestroyed()) {
      // Apply vibrancy FIRST (synchronously) before showing - fixes production transparency issue
      if (process.platform === "darwin") {
        agentPanelWindow.setVibrancy("under-window");
      }
      agentPanelWindow.show();
      // Notify renderer for entrance animation
      agentPanelWindow.webContents.send(IPC_CHANNELS.AGENTPANEL_SHOWN);
    }
  });

  // Hide Agent Panel
  ipcMain.on(IPC_CHANNELS.AGENTPANEL_HIDE, () => {
    if (agentPanelWindow && !agentPanelWindow.isDestroyed()) {
      agentPanelWindow.hide();
    }
  });

  // Vibrancy control for animation coordination (macOS only)
  ipcMain.on(IPC_CHANNELS.AGENTPANEL_VIBRANCY_ON, () => {
    if (process.platform === "darwin" && agentPanelWindow && !agentPanelWindow.isDestroyed()) {
      // Fade in vibrancy after content animation completes
      agentPanelWindow.setVibrancy("under-window");
    }
  });

  ipcMain.on(IPC_CHANNELS.AGENTPANEL_VIBRANCY_OFF, () => {
    if (process.platform === "darwin" && agentPanelWindow && !agentPanelWindow.isDestroyed()) {
      // Fade out vibrancy before/during exit animation
      agentPanelWindow.setVibrancy(null);
    }
  });

  // Resize Agent Panel width
  ipcMain.on(IPC_CHANNELS.AGENTPANEL_RESIZE, (_event, width: number) => {
    if (agentPanelWindow && !agentPanelWindow.isDestroyed()) {
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width: screenWidth, height: screenHeight } = primaryDisplay.bounds;

      // Clamp width between 350 and 600
      const clampedWidth = Math.max(350, Math.min(600, width));

      agentPanelWindow.setBounds(
        {
          x: screenWidth - clampedWidth,
          y: 0,
          width: clampedWidth,
          height: screenHeight,
        },
        true // animate
      );
    }
  });

  // Load conversation in Agent Panel (from Console)
  ipcMain.on(IPC_CHANNELS.AGENTPANEL_LOAD_CONVERSATION, (_event, conversationId: string) => {
    if (agentPanelWindow && !agentPanelWindow.isDestroyed()) {
      // Show panel if hidden
      if (!agentPanelWindow.isVisible()) {
        // Apply vibrancy FIRST (synchronously) before showing - fixes production transparency issue
        if (process.platform === "darwin") {
          agentPanelWindow.setVibrancy("under-window");
        }
        agentPanelWindow.show();
        // Notify renderer for entrance animation
        agentPanelWindow.webContents.send(IPC_CHANNELS.AGENTPANEL_SHOWN);
      }

      // Forward to renderer
      agentPanelWindow.webContents.send(IPC_CHANNELS.AGENTPANEL_LOAD_CONVERSATION, conversationId);
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
      const API_BASE_URL = "http://localhost:3000"; // TODO: Move to config
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

  // Dynamic mouse events for agent window
  ipcMain.on(IPC_CHANNELS.SET_IGNORE_MOUSE_EVENTS, (_event, ignore: boolean) => {
    if (agentWindow && !agentWindow.isDestroyed()) {
      agentWindow.setIgnoreMouseEvents(ignore, { forward: true });
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

  // Auth Management - Cross-window token sharing
  // Console sets tokens after login
  ipcMain.on(IPC_CHANNELS.AUTH_SET_TOKENS, (_event, accessToken: string, refreshToken: string) => {
    console.log("[Auth] Tokens set from Console window");
    authTokens.accessToken = accessToken;
    authTokens.refreshToken = refreshToken;

    // Broadcast token update to all windows
    const allWindows = [agentWindow, agentPanelWindow, conversationWindow, consoleWindow];
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
    const allWindows = [agentWindow, agentPanelWindow, conversationWindow, consoleWindow];
    allWindows.forEach((win) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.AUTH_TOKEN_UPDATED, null);
      }
    });
  });

  // ==================== Update Prompt IPC Handlers ====================

  // Edit draft - open console and navigate to drafts view
  ipcMain.on(IPC_CHANNELS.UPDATE_PROMPT_EDIT, (_event, draftId: string) => {
    console.log("[UpdatePrompt] Edit requested for draft:", draftId);

    // Hide update prompt window
    if (updatePromptWindow && !updatePromptWindow.isDestroyed()) {
      updatePromptWindow.hide();
    }

    // Show console and navigate to draft
    if (consoleWindow && !consoleWindow.isDestroyed()) {
      consoleWindow.show();
      consoleWindow.focus();
      // Send navigation message to console
      consoleWindow.webContents.send(IPC_CHANNELS.DRAFTS_NAVIGATE, draftId);
    }
  });

  // Send now - dismiss after success toast (handled in renderer)
  ipcMain.on(IPC_CHANNELS.UPDATE_PROMPT_SEND, (_event, draftId: string) => {
    console.log("[UpdatePrompt] Send now clicked for draft:", draftId);
    // Success toast is shown in renderer, then this is called
    // Hide the window after a delay (toast is shown for 1.5s in renderer)
    setTimeout(() => {
      if (updatePromptWindow && !updatePromptWindow.isDestroyed()) {
        updatePromptWindow.hide();
      }
    }, 500); // Short delay since renderer already waited 1.5s
  });

  // Dismiss prompt
  ipcMain.on(IPC_CHANNELS.UPDATE_PROMPT_DISMISS, () => {
    console.log("[UpdatePrompt] Dismissed");
    if (updatePromptWindow && !updatePromptWindow.isDestroyed()) {
      updatePromptWindow.hide();
    }
  });

  // ==================== Watching Pill IPC Handlers ====================

  // Show watching pill
  ipcMain.on(IPC_CHANNELS.WATCHING_PILL_SHOW, () => {
    console.log("[WatchingPill] Show requested");

    // Create window if it doesn't exist
    if (!watchingPillWindow || watchingPillWindow.isDestroyed()) {
      createWatchingPillWindow();
    }

    if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
      watchingPillWindow.show();
      console.log("[WatchingPill] Window shown");
    }
  });

  // Hide watching pill
  ipcMain.on(IPC_CHANNELS.WATCHING_PILL_HIDE, () => {
    console.log("[WatchingPill] Hide requested");
    if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
      watchingPillWindow.hide();
    }
  });

  // Toggle watching pill
  ipcMain.on(IPC_CHANNELS.WATCHING_PILL_TOGGLE, () => {
    console.log("[WatchingPill] Toggle requested");

    // Create window if it doesn't exist
    if (!watchingPillWindow || watchingPillWindow.isDestroyed()) {
      createWatchingPillWindow();
    }

    if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
      if (watchingPillWindow.isVisible()) {
        watchingPillWindow.hide();
        console.log("[WatchingPill] Window hidden");
      } else {
        watchingPillWindow.show();
        console.log("[WatchingPill] Window shown");
      }
    }
  });

  // Pause watching
  ipcMain.on(IPC_CHANNELS.WATCHING_PILL_PAUSE, () => {
    console.log("[WatchingPill] Watching paused");
    // In a real implementation, this would pause the screen monitoring
  });

  // Resume watching
  ipcMain.on(IPC_CHANNELS.WATCHING_PILL_RESUME, () => {
    console.log("[WatchingPill] Watching resumed");
    // In a real implementation, this would resume the screen monitoring
  });

  // Send update - open Console and navigate to drafts
  ipcMain.on(IPC_CHANNELS.WATCHING_PILL_SEND_UPDATE, () => {
    console.log("[WatchingPill] Send update - opening Console drafts");

    if (consoleWindow && !consoleWindow.isDestroyed()) {
      consoleWindow.show();
      consoleWindow.focus();
      // Navigate to draft detail
      consoleWindow.webContents.send(IPC_CHANNELS.DRAFTS_NAVIGATE, "demo-draft-001");
    }
  });

  // Screenshot Capture - Multi-window capture with smart caching
  ipcMain.handle(
    IPC_CHANNELS.CAPTURE_SCREENSHOT,
    async (
      _event,
      payload?: {
        message?: string;
      }
    ): Promise<MultiWindowCaptureResult> => {
      console.log("[Screenshot] Multi-window capture requested", {
        hasMessage: !!payload?.message,
      });

      try {
        // Get currently selected windows
        const selectedWindows = windowDetectionService.getSelectedWindows();
        const hasSelectedWindows = selectedWindows.length > 0;

        console.log("[Screenshot] Capture with filters:", {
          hasSelectedWindows,
          selectedWindows:
            selectedWindows
              .map((window) => `${window.appName} - ${window.windowTitle}`)
              .join(", ") || "none",
        });

        // Return early if no windows selected (watch mode OFF)
        if (!hasSelectedWindows) {
          console.log("[Screenshot] No windows selected, skipping capture");
          return {
            success: false,
            error: "No windows selected for capture",
            reason: "no_selection",
          };
        }

        // Convert selected windows to the format expected by captureWithCacheFallback
        const selectedApps = selectedWindows.map((w) => ({
          appName: w.appName,
          windowTitle: w.windowTitle,
        }));

        // Use smart capture with cache fallback (matches by appName, not windowId)
        const result = await captureService.captureWithCacheFallback(selectedApps);

        console.log("[Screenshot] Multi-window capture result:", {
          success: result.success,
          screenshotCount: result.success ? result.screenshots.length : 0,
          blockedCount: result.success ? result.blockedWindows.length : 0,
          totalDetected: result.success ? result.totalWindowsDetected : 0,
        });

        return result;
      } catch (error) {
        console.error("[Screenshot] Capture failed with error:", error);
        return {
          success: false,
          error: `Failed to capture windows: ${error instanceof Error ? error.message : "Unknown error"}`,
          reason: "technical_error",
        };
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

  // Watch Mode IPC Handlers
  setupWatchModeHandlers();
}

// Watch mode handlers for selective screenshot capture
function setupWatchModeHandlers() {
  // Toggle watch mode on/off
  ipcMain.handle(IPC_CHANNELS.WATCH_WINDOWS_TOGGLE, async (_event, enabled: boolean) => {
    console.log(`[Watch Mode] Toggling watch mode: ${enabled}`);

    windowDetectionService.setWatchingMode(enabled);

    if (enabled) {
      // Get all visible windows
      const windows = await windowDetectionService.getAllVisibleWindows();
      console.log(`[Watch Mode] Found ${windows.length} watchable windows`);

      // Create overlay buttons for ALL windows (including blocked ones to show policy)
      for (const window of windows) {
        createWatchButtonWindow(window, watchButtonWindows);
      }
    } else {
      // Close all watch button windows (but preserve selected windows state)
      console.log("[Watch Mode] Closing all watch button windows");
      for (const [windowId, buttonWindow] of watchButtonWindows.entries()) {
        if (!buttonWindow.isDestroyed()) {
          buttonWindow.close();
        }
        watchButtonWindows.delete(windowId);
      }
      // Don't clear selected windows - preserve state for re-expansion
    }
  });

  // Select a window to watch
  ipcMain.handle(
    IPC_CHANNELS.WATCH_WINDOW_SELECT,
    async (_event, windowInfo: SelectedWindowInfo) => {
      console.log(
        `[Watch Mode] Selecting window: ${windowInfo.appName} (${windowInfo.windowTitle}) [${windowInfo.windowId}]`
      );

      const windowDetails = windowDetectionService.getWindowDetails(windowInfo.windowId);

      if (!windowDetails) {
        console.warn(
          "[Watch Mode] Window details not found for selection, likely closed or stale",
          {
            windowId: windowInfo.windowId,
            appName: windowInfo.appName,
            windowTitle: windowInfo.windowTitle,
          }
        );
        return {
          allowed: false,
          reason: "This window is no longer available. Please try again.",
        };
      }

      // On non-macOS platforms, block all browser windows from watch mode
      if (process.platform !== "darwin") {
        const isBrowser = isBrowserProcess(windowDetails.appName, windowDetails.path);
        if (isBrowser) {
          console.log("[Watch Mode] Blocking browser window selection on non-macOS platform", {
            appName: windowDetails.appName,
            path: windowDetails.path,
          });
          return {
            allowed: false,
            reason: "Browser windows cannot be watched on this platform to protect sensitive data.",
          };
        }

        return selectWindowForWatch(windowInfo);
      }

      // macOS: only run focus + URL resolution for browser apps
      let resolvedTitle = windowDetails.title;
      let resolvedAppName = windowDetails.appName;
      let resolvedUrl: string | undefined = undefined;

      const isBrowserApp = isBrowserProcess(windowDetails.appName, windowDetails.path);

      if (isBrowserApp) {
        const resolved = await resolveWindowUrlForWatchSelection({
          processId: windowDetails.processId,
          appName: windowDetails.appName,
          windowTitle: windowDetails.title,
        });

        resolvedTitle = resolved.title;
        resolvedAppName = resolved.appName;
        resolvedUrl = resolved.url;
      }

      const policyDecision = isBlockedByPolicy(
        resolvedTitle,
        resolvedAppName,
        undefined,
        resolvedUrl
      );

      if (policyDecision.blocked) {
        console.log("[Watch Mode] Selection blocked by capture policy", {
          title: resolvedTitle,
          appName: resolvedAppName,
          reason: policyDecision.reason,
          hasUrl: !!resolvedUrl,
        });
        return {
          allowed: false,
          reason: policyDecision.reason || "Blocked by capture policy.",
        };
      }

      return selectWindowForWatch(windowInfo);
    }
  );

  // Unselect a window
  ipcMain.handle(IPC_CHANNELS.WATCH_WINDOW_UNSELECT, async (_event, windowId: string) => {
    console.log(`[Watch Mode] Unselecting window: ${windowId}`);

    // Get the window info before removing to clear the cache
    const selectedWindows = windowDetectionService.getSelectedWindows();
    const windowToRemove = selectedWindows.find((w) => w.windowId === windowId);

    const removed = windowDetectionService.removeWindow(windowId);

    if (removed) {
      // Clear the cached screenshot for this window (keyed by windowTitle)
      if (windowToRemove) {
        captureService.clearCachedScreenshot(windowToRemove.windowTitle);
        console.log(`[Watch Mode] Cleared cache for ${windowToRemove.windowTitle}`);
      }
      broadcastWatchWindowsUpdate();
    }
  });

  // Get currently selected windows
  ipcMain.handle(IPC_CHANNELS.WATCH_WINDOWS_GET_SELECTED, async () => {
    const selectedWindows = windowDetectionService.getSelectedWindows();
    console.log(`[Watch Mode] Returning ${selectedWindows.length} selected windows`);
    return selectedWindows;
  });

  // Broadcast updated window list to all windows
  function broadcastWatchWindowsUpdate() {
    const selectedWindows = windowDetectionService.getSelectedWindows();
    const windows = [agentWindow, agentPanelWindow, conversationWindow, consoleWindow];

    for (const window of windows) {
      if (window && !window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.WATCH_WINDOWS_UPDATED, selectedWindows);
      }
    }

    console.log(
      `[Watch Mode] Broadcasted update to windows. Selected windows: ${
        selectedWindows.map((window) => `${window.appName} - ${window.windowTitle}`).join(", ") ||
        "none"
      }`
    );
  }

  async function selectWindowForWatch(
    windowInfo: SelectedWindowInfo
  ): Promise<{ allowed: boolean }> {
    const added = windowDetectionService.addWindow(windowInfo);

    if (added) {
      const buttonWindow = watchButtonWindows.get(windowInfo.windowId);

      if (buttonWindow && !buttonWindow.isDestroyed()) {
        console.log(
          `[Watch Mode] Closing button for selected window: ${windowInfo.appName} (windowId: ${windowInfo.windowId})`
        );
        buttonWindow.close();
      }

      watchButtonWindows.delete(windowInfo.windowId);
      broadcastWatchWindowsUpdate();

      // Capture and cache screenshot immediately (window is visible now)
      // Match by windowTitle since desktopCapturer returns titles, not app names
      try {
        const captureResult = await captureService.captureVisibleWindows(false);
        if (captureResult.success && captureResult.screenshots) {
          const screenshot = captureResult.screenshots.find(
            (s) => s.windowTitle.toLowerCase() === windowInfo.windowTitle.toLowerCase()
          );
          if (screenshot) {
            captureService.cacheScreenshot(windowInfo.windowTitle, {
              appName: windowInfo.appName,
              windowTitle: windowInfo.windowTitle,
              dataUrl: screenshot.dataUrl,
              capturedAt: Date.now(),
              metadata: screenshot.metadata,
            });
            console.log(
              `[Watch Mode] Cached screenshot for ${windowInfo.windowTitle} at selection time`
            );
          }
        }
      } catch (error) {
        console.warn("[Watch Mode] Failed to cache screenshot at selection time:", error);
      }
    }

    return { allowed: true };
  }

  console.log("[IPC] Watch mode handlers registered successfully");
}

function isBrowserProcess(appName: string, appPath?: string): boolean {
  const haystack = `${appName || ""} ${appPath || ""}`.toLowerCase();

  // Simple heuristic for common browsers across platforms
  const browserPatterns = [
    "chrome",
    "google chrome",
    "msedge",
    "edge",
    "firefox",
    "safari",
    "brave",
    "opera",
    "vivaldi",
    "arc",
  ];

  return browserPatterns.some((pattern) => haystack.includes(pattern));
}

// Helper function to create a watch button window
function createWatchButtonWindow(window: any, watchButtonWindows: Map<string, BrowserWindow>) {
  const buttonWindow = new BrowserWindow({
    width: 250,
    height: 50,
    x: window.bounds.x + 10,
    y: window.bounds.y + 10,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, "../preload/watchButton.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Pass data via query parameters
  const queryParams = new URLSearchParams({
    windowId: window.windowId,
    appName: window.appName,
    windowTitle: window.windowTitle,
  });

  if (!app.isPackaged) {
    buttonWindow.loadURL(`http://localhost:5173/watchButton/index.html?${queryParams.toString()}`);
  } else {
    buttonWindow.loadFile(join(__dirname, "../renderer/watchButton/index.html"), {
      query: Object.fromEntries(queryParams.entries()),
    });
  }

  // Cleanup on close
  buttonWindow.on("closed", () => {
    console.log(`[Watch Mode] Button window closed for: ${window.appName}`);
    watchButtonWindows.delete(window.windowId);
  });

  watchButtonWindows.set(window.windowId, buttonWindow);

  console.log(
    `[Watch Mode] Created button for ${window.appName} at (${window.bounds.x + 10}, ${window.bounds.y + 10})`
  );
}

// Helper function to close all watch button windows
function closeAllWatchButtonWindows(watchButtonWindows: Map<string, BrowserWindow>) {
  const count = watchButtonWindows.size;
  console.log(`[Watch Mode] Closing ${count} watch button windows`);

  for (const [windowId, buttonWindow] of watchButtonWindows.entries()) {
    if (!buttonWindow.isDestroyed()) {
      buttonWindow.close();
    }
    watchButtonWindows.delete(windowId);
  }

  console.log(`[Watch Mode] ✅ Closed ${count} watch button windows`);
}

// Global shortcut for help (Cmd+H / Ctrl+H)
function registerGlobalShortcuts() {
  // Old Agent pill (Cmd+H)
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

  // Agent Panel (Cmd+Shift+A)
  globalShortcut.register("CommandOrControl+Shift+A", () => {
    if (agentPanelWindow && !agentPanelWindow.isDestroyed()) {
      if (agentPanelWindow.isVisible()) {
        // Request animated close via renderer (don't hide directly)
        agentPanelWindow.webContents.send(IPC_CHANNELS.AGENTPANEL_REQUEST_CLOSE);
      } else {
        // Apply vibrancy FIRST (synchronously) before showing - fixes production transparency issue
        if (process.platform === "darwin") {
          agentPanelWindow.setVibrancy("under-window");
        }
        agentPanelWindow.show();
        agentPanelWindow.focus();
        // Notify renderer for entrance animation
        agentPanelWindow.webContents.send(IPC_CHANNELS.AGENTPANEL_SHOWN);
      }
    }
  });

  // Update Prompt Demo Trigger (Cmd+Shift+U)
  globalShortcut.register("CommandOrControl+Shift+U", () => {
    console.log("[UpdatePrompt] Demo trigger shortcut activated");

    // Create window if it doesn't exist
    if (!updatePromptWindow || updatePromptWindow.isDestroyed()) {
      createUpdatePromptWindow();
    }

    if (updatePromptWindow && !updatePromptWindow.isDestroyed()) {
      // Send demo draft data to the window
      updatePromptWindow.webContents.send(IPC_CHANNELS.UPDATE_PROMPT_TRIGGER, {
        id: "demo-draft-001",
        topic: "Weekly standup update ready",
        recipient: "#engineering-standup",
      });
      updatePromptWindow.show();
      console.log("[UpdatePrompt] Window shown with demo data");
    }
  });

  // Watching Pill Toggle (Cmd+Shift+W)
  globalShortcut.register("CommandOrControl+Shift+W", () => {
    console.log("[WatchingPill] Toggle shortcut activated");

    // Create window if it doesn't exist
    if (!watchingPillWindow || watchingPillWindow.isDestroyed()) {
      createWatchingPillWindow();
    }

    if (watchingPillWindow && !watchingPillWindow.isDestroyed()) {
      if (watchingPillWindow.isVisible()) {
        watchingPillWindow.hide();
        console.log("[WatchingPill] Window hidden");
      } else {
        watchingPillWindow.show();
        console.log("[WatchingPill] Window shown");
      }
    }
  });
}

app.whenReady().then(() => {
  // Initialize active window bridge for capture policy
  initActiveWindowBridge();

  createAgentWindow();
  createConversationWindow(); // Create conversation window as child of agent
  createAgentPanelWindow(); // Create Agent Panel (right-docked chat panel)
  createConsoleWindow();

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
