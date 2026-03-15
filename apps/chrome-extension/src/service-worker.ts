import type {
  BridgeRequest,
  BridgeResponse,
  ContentScriptRequest,
  ContentScriptResponse,
} from "./types";

const DISCOVERY_PORTS = [19876, 19877, 19878, 19879, 19880];
const RECONNECT_DELAYS = [1000, 3000, 10000]; // Exponential backoff

let ws: WebSocket | null = null;
let reconnectAttempt = 0;
let isConnected = false;

/** Discover the bridge by scanning known ports for the HTTP config endpoint */
async function discoverBridge(): Promise<{ port: number; token: string } | null> {
  for (const port of DISCOVERY_PORTS) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/mitable-bridge/config`);
      if (!res.ok) continue;

      const data = await res.json();
      if (data && data.name === "mitable" && typeof data.token === "string") {
        return { port, token: data.token };
      }
    } catch {
      // Port not listening or not our service, try next
    }
  }
  return null;
}

/** Connect to the Electron WebSocket server */
async function connect(): Promise<void> {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  const bridge = await discoverBridge();
  if (!bridge) {
    console.warn("[MitableBridge] Cannot connect: Mitable bridge not found on any port");
    scheduleReconnect();
    return;
  }

  try {
    ws = new WebSocket(`ws://127.0.0.1:${bridge.port}?token=${bridge.token}`);

    ws.onopen = () => {
      console.log("[MitableBridge] Connected to Electron on port", bridge.port);
      isConnected = true;
      reconnectAttempt = 0;
      updateBadge(true);
      saveState(true);

      // Send connected event
      ws!.send(
        JSON.stringify({
          id: crypto.randomUUID(),
          type: "event",
          action: "connected",
          payload: { version: chrome.runtime.getManifest().version },
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as BridgeRequest;
        handleRequest(message);
      } catch (err) {
        console.error("[MitableBridge] Failed to parse message:", err);
      }
    };

    ws.onclose = () => {
      console.log("[MitableBridge] Disconnected");
      ws = null;
      isConnected = false;
      updateBadge(false);
      saveState(false);
      scheduleReconnect();
    };

    ws.onerror = (err) => {
      console.error("[MitableBridge] WebSocket error:", err);
    };
  } catch (err) {
    console.error("[MitableBridge] Connection failed:", err);
    scheduleReconnect();
  }
}

/** Schedule a reconnection attempt with exponential backoff */
function scheduleReconnect(): void {
  if (reconnectAttempt >= RECONNECT_DELAYS.length) {
    console.log("[MitableBridge] Max reconnect attempts reached. Will retry on alarm.");
    return;
  }

  const delay = RECONNECT_DELAYS[reconnectAttempt]!;
  reconnectAttempt++;
  console.log(`[MitableBridge] Reconnecting in ${delay}ms (attempt ${reconnectAttempt})`);
  setTimeout(() => connect(), delay);
}

/** Send a response back to Electron */
function sendResponse(response: BridgeResponse): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(response));
  }
}

/** Handle incoming requests from Electron */
async function handleRequest(request: BridgeRequest): Promise<void> {
  const { id, action, payload } = request;

  try {
    switch (action) {
      case "ping":
        sendResponse({
          id,
          type: "response",
          action: "ping",
          payload: { pong: true, version: chrome.runtime.getManifest().version },
          success: true,
        });
        break;

      case "get_tabs":
        await handleGetTabs(id);
        break;

      case "navigate":
        await handleNavigate(id, payload as { url: string; tabId?: number; waitForLoad?: boolean });
        break;

      case "extract":
        await handleExtract(
          id,
          payload as { tabId?: number; mode?: "text" | "structured"; selector?: string }
        );
        break;

      case "click":
        await handleClick(
          id,
          payload as { selector: string; text?: string; tabId?: number }
        );
        break;

      case "type":
        await handleType(
          id,
          payload as { selector: string; text: string; clear?: boolean; tabId?: number }
        );
        break;

      case "wait":
        await handleWait(
          id,
          payload as { selector: string; timeout?: number; tabId?: number }
        );
        break;

      default:
        sendResponse({
          id,
          type: "response",
          action,
          payload: null,
          success: false,
          error: `Unknown action: ${action}`,
        });
    }
  } catch (err) {
    sendResponse({
      id,
      type: "response",
      action,
      payload: null,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** List all open tabs */
async function handleGetTabs(requestId: string): Promise<void> {
  const tabs = await chrome.tabs.query({});
  const tabList = tabs.map((t) => ({
    id: t.id,
    url: t.url || "",
    title: t.title || "",
    active: t.active || false,
  }));

  sendResponse({
    id: requestId,
    type: "response",
    action: "get_tabs",
    payload: { tabs: tabList },
    success: true,
  });
}

/** Navigate to a URL */
async function handleNavigate(
  requestId: string,
  payload: { url: string; tabId?: number; waitForLoad?: boolean }
): Promise<void> {
  const { url, tabId, waitForLoad = true } = payload;

  let targetTabId: number;

  if (tabId) {
    // Navigate existing tab
    await chrome.tabs.update(tabId, { url });
    targetTabId = tabId;
  } else {
    // Navigate active tab
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) {
      sendResponse({
        id: requestId,
        type: "response",
        action: "navigate",
        payload: null,
        success: false,
        error: "No active tab found",
      });
      return;
    }
    await chrome.tabs.update(activeTab.id, { url });
    targetTabId = activeTab.id;
  }

  if (waitForLoad) {
    // Wait for the tab to finish loading
    await new Promise<void>((resolve) => {
      const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
        if (updatedTabId === targetTabId && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      // Timeout after 30s
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 30_000);
    });
  }

  const tab = await chrome.tabs.get(targetTabId);
  sendResponse({
    id: requestId,
    type: "response",
    action: "navigate",
    payload: { url: tab.url, title: tab.title, tabId: targetTabId },
    success: true,
  });
}

/** Extract content from a page via content script */
async function handleExtract(
  requestId: string,
  payload: { tabId?: number; mode?: "text" | "structured"; selector?: string }
): Promise<void> {
  const { tabId, mode = "text", selector } = payload;

  let targetTabId: number;

  if (tabId) {
    targetTabId = tabId;
  } else {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) {
      sendResponse({
        id: requestId,
        type: "response",
        action: "extract",
        payload: null,
        success: false,
        error: "No active tab found",
      });
      return;
    }
    targetTabId = activeTab.id;
  }

  const message: ContentScriptRequest = { type: "dom_extract", mode, selector };

  try {
    const response = (await chrome.tabs.sendMessage(targetTabId, message)) as ContentScriptResponse;

    if (response && response.success) {
      sendResponse({
        id: requestId,
        type: "response",
        action: "extract",
        payload: { content: response.content },
        success: true,
      });
    } else {
      sendResponse({
        id: requestId,
        type: "response",
        action: "extract",
        payload: null,
        success: false,
        error: response?.error || "Content script returned no data",
      });
    }
  } catch (err) {
    // Content script might not be injected yet, try scripting API
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        func: extractPageContent,
        args: [mode, selector || null],
      });
      const result = results[0]?.result;
      sendResponse({
        id: requestId,
        type: "response",
        action: "extract",
        payload: { content: result || "" },
        success: true,
      });
    } catch (scriptErr) {
      sendResponse({
        id: requestId,
        type: "response",
        action: "extract",
        payload: null,
        success: false,
        error: `Failed to extract: ${scriptErr instanceof Error ? scriptErr.message : String(scriptErr)}`,
      });
    }
  }
}

/** Click an element in a tab */
async function handleClick(
  requestId: string,
  payload: { selector: string; text?: string; tabId?: number }
): Promise<void> {
  const { selector, text, tabId } = payload;
  const targetTabId = await resolveTabId(tabId);
  if (targetTabId === null) {
    sendResponse({ id: requestId, type: "response", action: "click", payload: null, success: false, error: "No active tab found" });
    return;
  }

  const message: ContentScriptRequest = { type: "dom_click", selector, text };

  try {
    const response = (await chrome.tabs.sendMessage(targetTabId, message)) as ContentScriptResponse;
    if (response?.success) {
      sendResponse({ id: requestId, type: "response", action: "click", payload: { clicked: true, tagName: response.tagName, textContent: response.textContent }, success: true });
    } else {
      sendResponse({ id: requestId, type: "response", action: "click", payload: null, success: false, error: response?.error || "Click failed" });
    }
  } catch {
    // Fallback: inject script
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        func: injectedClickElement,
        args: [selector, text || null],
      });
      const result = results[0]?.result as { success: boolean; tagName?: string; textContent?: string; error?: string } | null;
      if (result?.success) {
        sendResponse({ id: requestId, type: "response", action: "click", payload: { clicked: true, tagName: result.tagName, textContent: result.textContent }, success: true });
      } else {
        sendResponse({ id: requestId, type: "response", action: "click", payload: null, success: false, error: result?.error || "Click failed via scripting API" });
      }
    } catch (scriptErr) {
      sendResponse({ id: requestId, type: "response", action: "click", payload: null, success: false, error: `Failed to click: ${scriptErr instanceof Error ? scriptErr.message : String(scriptErr)}` });
    }
  }
}

/** Type text into an element in a tab */
async function handleType(
  requestId: string,
  payload: { selector: string; text: string; clear?: boolean; tabId?: number }
): Promise<void> {
  const { selector, text, clear = true, tabId } = payload;
  const targetTabId = await resolveTabId(tabId);
  if (targetTabId === null) {
    sendResponse({ id: requestId, type: "response", action: "type", payload: null, success: false, error: "No active tab found" });
    return;
  }

  const message: ContentScriptRequest = { type: "dom_type", selector, text, clear };

  try {
    const response = (await chrome.tabs.sendMessage(targetTabId, message)) as ContentScriptResponse;
    if (response?.success) {
      sendResponse({ id: requestId, type: "response", action: "type", payload: { typed: true, tagName: response.tagName, value: response.textContent }, success: true });
    } else {
      sendResponse({ id: requestId, type: "response", action: "type", payload: null, success: false, error: response?.error || "Type failed" });
    }
  } catch {
    // Fallback: inject script
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        func: injectedTypeIntoElement,
        args: [selector, text, clear],
      });
      const result = results[0]?.result as { success: boolean; tagName?: string; value?: string; error?: string } | null;
      if (result?.success) {
        sendResponse({ id: requestId, type: "response", action: "type", payload: { typed: true, tagName: result.tagName, value: result.value }, success: true });
      } else {
        sendResponse({ id: requestId, type: "response", action: "type", payload: null, success: false, error: result?.error || "Type failed via scripting API" });
      }
    } catch (scriptErr) {
      sendResponse({ id: requestId, type: "response", action: "type", payload: null, success: false, error: `Failed to type: ${scriptErr instanceof Error ? scriptErr.message : String(scriptErr)}` });
    }
  }
}

/** Wait for an element to appear in a tab */
async function handleWait(
  requestId: string,
  payload: { selector: string; timeout?: number; tabId?: number }
): Promise<void> {
  const { selector, timeout = 10000, tabId } = payload;
  const targetTabId = await resolveTabId(tabId);
  if (targetTabId === null) {
    sendResponse({ id: requestId, type: "response", action: "wait", payload: null, success: false, error: "No active tab found" });
    return;
  }

  const message: ContentScriptRequest = { type: "dom_wait", selector, timeout };

  try {
    const response = (await chrome.tabs.sendMessage(targetTabId, message)) as ContentScriptResponse;
    if (response?.success) {
      sendResponse({ id: requestId, type: "response", action: "wait", payload: { found: true, tagName: response.tagName, textContent: response.textContent }, success: true });
    } else {
      sendResponse({ id: requestId, type: "response", action: "wait", payload: { found: false }, success: false, error: response?.error || "Wait timed out" });
    }
  } catch {
    // Fallback: inject script
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        func: injectedWaitForElement,
        args: [selector, timeout],
      });
      const result = results[0]?.result as { success: boolean; found: boolean; tagName?: string; textContent?: string; error?: string } | null;
      if (result?.success) {
        sendResponse({ id: requestId, type: "response", action: "wait", payload: { found: true, tagName: result.tagName, textContent: result.textContent }, success: true });
      } else {
        sendResponse({ id: requestId, type: "response", action: "wait", payload: { found: false }, success: false, error: result?.error || "Wait timed out" });
      }
    } catch (scriptErr) {
      sendResponse({ id: requestId, type: "response", action: "wait", payload: null, success: false, error: `Failed to wait: ${scriptErr instanceof Error ? scriptErr.message : String(scriptErr)}` });
    }
  }
}

/** Resolve a tabId, defaulting to the active tab */
async function resolveTabId(tabId?: number): Promise<number | null> {
  if (tabId) return tabId;
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return activeTab?.id ?? null;
}

/** Injected function: click an element */
function injectedClickElement(selector: string, text: string | null): { success: boolean; tagName?: string; textContent?: string; error?: string } {
  let el = document.querySelector(selector);

  // Fallback: find by text using TreeWalker
  if (!el && text) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        const elem = node as HTMLElement;
        if (elem.children.length === 0 && elem.textContent?.trim().includes(text)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      },
    });
    el = walker.nextNode() as Element | null;
  }

  if (!el) {
    return { success: false, error: `No element found for selector: ${selector}${text ? ` or text: "${text}"` : ""}` };
  }

  (el as HTMLElement).click();
  return { success: true, tagName: el.tagName.toLowerCase(), textContent: el.textContent?.trim().slice(0, 200) || "" };
}

/** Injected function: type into an element */
function injectedTypeIntoElement(selector: string, text: string, clear: boolean): { success: boolean; tagName?: string; value?: string; error?: string } {
  const el = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el) return { success: false, error: `No element found for selector: ${selector}` };

  el.focus();
  if (clear) el.value = "";
  el.value += text;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));

  return { success: true, tagName: el.tagName.toLowerCase(), value: el.value.slice(0, 200) };
}

/** Injected function: wait for an element */
function injectedWaitForElement(selector: string, timeout: number): Promise<{ success: boolean; found: boolean; tagName?: string; textContent?: string; error?: string }> {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector);
    if (existing) {
      resolve({ success: true, found: true, tagName: existing.tagName.toLowerCase(), textContent: existing.textContent?.trim().slice(0, 200) || "" });
      return;
    }

    const interval = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
        clearInterval(interval);
        clearTimeout(timer);
        resolve({ success: true, found: true, tagName: el.tagName.toLowerCase(), textContent: el.textContent?.trim().slice(0, 200) || "" });
      }
    }, 200);

    const timer = setTimeout(() => {
      clearInterval(interval);
      resolve({ success: false, found: false, error: `Timeout: element "${selector}" not found within ${timeout}ms` });
    }, timeout);
  });
}

/** Injected function for chrome.scripting.executeScript fallback */
function extractPageContent(mode: string, selector: string | null): string {
  const root = selector ? document.querySelector(selector) : document.body;
  if (!root) return selector ? `No element found for selector: ${selector}` : "";

  if (mode === "structured") {
    const title = document.title;
    const headings = Array.from(root.querySelectorAll("h1, h2, h3, h4, h5, h6")).map(
      (h) => `${h.tagName}: ${h.textContent?.trim()}`
    );
    const links = Array.from(root.querySelectorAll("a[href]"))
      .slice(0, 50)
      .map((a) => `${a.textContent?.trim()} → ${(a as HTMLAnchorElement).href}`);
    const text = root.textContent?.trim().slice(0, 10000) || "";

    return [
      `Title: ${title}`,
      "",
      "Headings:",
      ...headings,
      "",
      "Links (first 50):",
      ...links,
      "",
      "Text content (first 10000 chars):",
      text,
    ].join("\n");
  }

  // Plain text mode
  return root.textContent?.trim().slice(0, 15000) || "";
}

/** Update extension badge to show connection status */
function updateBadge(connected: boolean): void {
  chrome.action.setBadgeText({ text: connected ? "ON" : "" });
  chrome.action.setBadgeBackgroundColor({ color: connected ? "#22c55e" : "#ef4444" });
}

/** Save connection state to storage for popup */
function saveState(connected: boolean): void {
  chrome.storage.local.set({ bridgeConnected: connected });
}

// Keep-alive alarm for MV3 service worker
chrome.alarms.create("keepalive", { periodInMinutes: 0.4 }); // Every 24s

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keepalive") {
    // If not connected, try to reconnect
    if (!isConnected) {
      reconnectAttempt = 0; // Reset reconnect counter on alarm
      connect();
    }
  }
});

// Start connection on install/startup
chrome.runtime.onInstalled.addListener(() => {
  console.log("[MitableBridge] Extension installed");
  connect();
});

chrome.runtime.onStartup.addListener(() => {
  console.log("[MitableBridge] Extension startup");
  connect();
});

// Handle messages from popup (reconnect button)
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "reconnect") {
    reconnectAttempt = 0;
    connect();
  }
});

// Also connect immediately when service worker loads
connect();
