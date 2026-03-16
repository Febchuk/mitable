// ========================================
// Mitable Browser Bridge — Popup State Machine
// ========================================

type PopupState = "connecting" | "connected" | "disconnected" | "automation";

interface BridgeStatus {
  bridgeConnected: boolean;
  bridgePort?: number;
  bridgeVersion?: string;
  bridgeLastAction?: { action: string; selector?: string; timestamp: number };
  bridgeRecentActions?: Array<{ action: string; timestamp: number; success: boolean }>;
  bridgeAgentActive?: boolean;
  bridgeSessionActive?: boolean;
  bridgeSessionStart?: number;
  bridgeConnecting?: boolean;
  bridgeConnectingPort?: number;
  autoReconnect?: boolean;
}

// ========================================
// DOM References
// ========================================

// Views
const mainView = document.getElementById("mainView")!;
const settingsView = document.getElementById("settingsView")!;

// State containers
const stateConnected = document.getElementById("stateConnected")!;
const stateDisconnected = document.getElementById("stateDisconnected")!;
const stateConnecting = document.getElementById("stateConnecting")!;
const agentBanner = document.getElementById("agentBanner")!;
const mainFooter = document.getElementById("mainFooter")!;

// Connected state elements
const connectedDetail = document.getElementById("connectedDetail")!;
const tabFavicon = document.getElementById("tabFavicon")!;
const tabTitle = document.getElementById("tabTitle")!;
const tabUrl = document.getElementById("tabUrl")!;
const activityIdle = document.getElementById("activityIdle")!;
const activityActive = document.getElementById("activityActive")!;
const currentAction = document.getElementById("currentAction")!;
const currentActionText = document.getElementById("currentActionText")!;
const currentActionSelector = document.getElementById("currentActionSelector")!;
const recentList = document.getElementById("recentList")!;
const sessionCard = document.getElementById("sessionCard")!;
const sessionDetail = document.getElementById("sessionDetail")!;

// Connecting state
const connectingPort = document.getElementById("connectingPort")!;

// Disconnected state
const reconnectBtn = document.getElementById("reconnectBtn")!;
const troubleshoot = document.getElementById("troubleshoot")!;

// Settings
const settingsBtn = document.getElementById("settingsBtn")!;
const settingsBack = document.getElementById("settingsBack")!;
const settingsStatusDot = document.getElementById("settingsStatusDot")!;
const settingsStatusText = document.getElementById("settingsStatusText")!;
const settingsPort = document.getElementById("settingsPort")!;
const settingsVersion = document.getElementById("settingsVersion")!;
const settingsExtVersion = document.getElementById("settingsExtVersion")!;
const settingsBridgeVersion = document.getElementById("settingsBridgeVersion")!;
const toggleAutoReconnect = document.getElementById("toggleAutoReconnect")!;
const openDesktopBtn = document.getElementById("openDesktopBtn")!;

// ========================================
// State
// ========================================

let currentState: PopupState = "connecting";
let currentStatus: BridgeStatus = { bridgeConnected: false };

// ========================================
// State machine
// ========================================

function setState(state: PopupState): void {
  currentState = state;

  // Hide all state sections
  stateConnected.style.display = "none";
  stateDisconnected.style.display = "none";
  stateConnecting.style.display = "none";
  agentBanner.style.display = "none";

  // Show footer for connected/automation, hide for others
  mainFooter.style.display = state === "connected" || state === "automation" ? "block" : "none";

  switch (state) {
    case "connected":
      stateConnected.style.display = "block";
      break;
    case "disconnected":
      stateDisconnected.style.display = "block";
      break;
    case "connecting":
      stateConnecting.style.display = "block";
      break;
    case "automation":
      agentBanner.style.display = "block";
      stateConnected.style.display = "block";
      break;
  }
}

// ========================================
// Update UI from status
// ========================================

function updateFromStatus(status: BridgeStatus): void {
  currentStatus = status;

  if (status.bridgeConnecting && !status.bridgeConnected) {
    setState("connecting");
    if (status.bridgeConnectingPort) {
      connectingPort.textContent = `Checking port ${status.bridgeConnectingPort}...`;
    }
  } else if (status.bridgeConnected) {
    if (status.bridgeAgentActive) {
      setState("automation");
    } else {
      setState("connected");
    }

    // Port + version
    const port = status.bridgePort || "—";
    const version = status.bridgeVersion || "—";
    connectedDetail.textContent = `Port ${port} · v${version}`;

    // Activity
    updateActivity(status);

    // Session
    if (status.bridgeSessionActive) {
      sessionCard.style.display = "block";
      if (status.bridgeSessionStart) {
        const time = new Date(status.bridgeSessionStart);
        sessionDetail.textContent = `Capturing since ${formatTime(time)}`;
      }
    } else {
      sessionCard.style.display = "none";
    }
  } else {
    setState("disconnected");
  }

  // Update settings view
  updateSettings(status);
}

function updateActivity(status: BridgeStatus): void {
  const hasRecent = status.bridgeRecentActions && status.bridgeRecentActions.length > 0;
  const hasLast = status.bridgeLastAction;

  if (!hasRecent && !hasLast) {
    activityIdle.style.display = "flex";
    activityActive.style.display = "none";
    return;
  }

  activityIdle.style.display = "none";
  activityActive.style.display = "block";

  // Current action
  if (hasLast && status.bridgeAgentActive) {
    currentAction.style.display = "flex";
    currentActionText.textContent = formatAction(status.bridgeLastAction!.action) + "...";
    currentActionSelector.textContent = status.bridgeLastAction!.selector || "";
    currentActionSelector.style.display = status.bridgeLastAction!.selector ? "block" : "none";
  } else {
    currentAction.style.display = "none";
  }

  // Recent actions
  recentList.innerHTML = "";
  if (hasRecent) {
    const actions = status.bridgeRecentActions!.slice(0, 5);
    for (const action of actions) {
      const row = document.createElement("div");
      row.className = "recent-item";

      const icon = action.success
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

      const timeAgo = getTimeAgo(action.timestamp);

      row.innerHTML = `
        ${icon}
        <span class="recent-item-text">${formatAction(action.action)}</span>
        <span class="recent-item-time">${timeAgo}</span>
      `;

      if (!action.success) {
        const svg = row.querySelector("svg");
        if (svg) svg.style.color = "var(--status-error)";
      }

      recentList.appendChild(row);
    }
  }
}

function updateSettings(status: BridgeStatus): void {
  const connected = status.bridgeConnected;

  settingsStatusDot.className = connected
    ? "status-dot status-dot--connected"
    : "status-dot status-dot--disconnected";
  settingsStatusDot.style.width = "6px";
  settingsStatusDot.style.height = "6px";
  settingsStatusText.textContent = connected ? "Connected" : "Disconnected";
  settingsPort.textContent = status.bridgePort ? String(status.bridgePort) : "—";
  settingsVersion.textContent = status.bridgeVersion ? `v${status.bridgeVersion}` : "—";
  settingsBridgeVersion.textContent = status.bridgeVersion ? `v${status.bridgeVersion}` : "—";

  // Extension version from manifest
  const extVersion = chrome.runtime.getManifest().version;
  settingsExtVersion.textContent = `v${extVersion}`;

  // Auto-reconnect toggle
  if (status.autoReconnect !== false) {
    toggleAutoReconnect.classList.add("active");
  } else {
    toggleAutoReconnect.classList.remove("active");
  }
}

// ========================================
// Tab info
// ========================================

function updateTabInfo(): void {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab) return;

    const title = tab.title || "Untitled";
    const url = tab.url || "";

    tabTitle.textContent = title;
    tabUrl.textContent = url;

    // Favicon
    if (tab.favIconUrl) {
      const img = document.createElement("img");
      img.src = tab.favIconUrl;
      img.width = 16;
      img.height = 16;
      img.style.borderRadius = "2px";
      img.onerror = () => {
        // Fallback to globe icon on error
        tabFavicon.innerHTML = globeSvg();
      };
      tabFavicon.innerHTML = "";
      tabFavicon.appendChild(img);
    } else {
      tabFavicon.innerHTML = globeSvg();
    }
  });
}

function globeSvg(): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
}

// ========================================
// Helpers
// ========================================

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatAction(action: string): string {
  const map: Record<string, string> = {
    click: "Clicked element",
    type: "Typed text",
    navigate: "Navigated",
    extract: "Extracted content",
    screenshot: "Screenshot",
    wait: "Waited for element",
    scroll: "Scrolled page",
    select: "Selected option",
    hover: "Hovered element",
    read_element: "Read element",
    keyboard: "Sent keyboard event",
    execute_js: "Executed JavaScript",
    tab_open: "Opened tab",
    tab_close: "Closed tab",
    get_tabs: "Listed tabs",
    ping: "Ping",
  };
  return map[action] || action;
}

function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

// ========================================
// View switching
// ========================================

function showMain(): void {
  mainView.classList.add("active");
  settingsView.classList.remove("active");
}

function showSettings(): void {
  mainView.classList.remove("active");
  settingsView.classList.add("active");
}

// ========================================
// Event listeners
// ========================================

settingsBtn.addEventListener("click", showSettings);
settingsBack.addEventListener("click", showMain);

reconnectBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "reconnect" });
  setState("connecting");
});

troubleshoot.addEventListener("click", () => {
  troubleshoot.classList.toggle("open");
});

toggleAutoReconnect.addEventListener("click", () => {
  const isActive = toggleAutoReconnect.classList.toggle("active");
  chrome.storage.local.set({ autoReconnect: isActive });
});

openDesktopBtn.addEventListener("click", () => {
  // Attempt to open the desktop app via custom protocol
  chrome.tabs.create({ url: "mitable://open" });
});

// ========================================
// Initialize
// ========================================

// Request full status from service worker
chrome.runtime.sendMessage({ action: "getStatus" }, (response: BridgeStatus | undefined) => {
  if (response) {
    updateFromStatus(response);
  } else {
    // Fallback: read from storage
    chrome.storage.local.get(null, (result) => {
      updateFromStatus(result as BridgeStatus);
    });
  }
  updateTabInfo();
});

// Listen for storage changes (real-time updates)
chrome.storage.onChanged.addListener((changes) => {
  const keys = [
    "bridgeConnected",
    "bridgePort",
    "bridgeVersion",
    "bridgeLastAction",
    "bridgeRecentActions",
    "bridgeAgentActive",
    "bridgeSessionActive",
    "bridgeSessionStart",
    "bridgeConnecting",
    "bridgeConnectingPort",
    "autoReconnect",
  ];

  let needsUpdate = false;
  for (const key of keys) {
    if (changes[key]) {
      (currentStatus as Record<string, unknown>)[key] = changes[key].newValue;
      needsUpdate = true;
    }
  }

  if (needsUpdate) {
    updateFromStatus(currentStatus);
  }
});

// Refresh tab info periodically (tab could change while popup is open)
setInterval(updateTabInfo, 2000);
