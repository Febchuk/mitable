import type { ContentScriptRequest, ContentScriptResponse } from "./types";

/** Handle messages from the service worker */
chrome.runtime.onMessage.addListener(
  (
    message: ContentScriptRequest,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: ContentScriptResponse) => void
  ) => {
    switch (message.type) {
      case "dom_extract":
        try {
          const content = extractContent(message.mode, message.selector);
          sendResponse({ success: true, content });
        } catch (err) {
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return true;

      case "dom_click":
        try {
          const result = clickElement(message.selector, message.text);
          sendResponse(result);
        } catch (err) {
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return true;

      case "dom_type":
        try {
          const result = typeIntoElement(message.selector, message.text, message.clear);
          sendResponse(result);
        } catch (err) {
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return true;

      case "dom_wait":
        waitForElement(message.selector, message.timeout).then(sendResponse);
        return true; // async
    }
  }
);

/** Extract page content based on mode */
function extractContent(mode: "text" | "structured", selector?: string): string {
  const root = selector ? document.querySelector(selector) : document.body;
  if (!root) {
    return selector ? `No element found for selector: ${selector}` : "";
  }

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

/** Find element by CSS selector, with optional text content fallback */
function findElement(selector: string, text?: string): Element | null {
  // Try CSS selector first
  const el = document.querySelector(selector);
  if (el) return el;

  // Fallback: find by visible text using TreeWalker
  if (text) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        const el = node as HTMLElement;
        if (el.children.length === 0 && el.textContent?.trim().includes(text)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      },
    });
    const found = walker.nextNode();
    if (found) return found as Element;
  }

  return null;
}

/** Click an element by selector or text */
function clickElement(selector: string, text?: string): ContentScriptResponse {
  const el = findElement(selector, text);
  if (!el) {
    return { success: false, error: `No element found for selector: ${selector}${text ? ` or text: "${text}"` : ""}` };
  }
  (el as HTMLElement).click();
  return {
    success: true,
    tagName: el.tagName.toLowerCase(),
    textContent: el.textContent?.trim().slice(0, 200) || "",
  };
}

/** Type text into an input/textarea element */
function typeIntoElement(selector: string, text: string, clear: boolean): ContentScriptResponse {
  const el = document.querySelector(selector);
  if (!el) {
    return { success: false, error: `No element found for selector: ${selector}` };
  }

  const inputEl = el as HTMLInputElement | HTMLTextAreaElement;
  inputEl.focus();

  if (clear) {
    inputEl.value = "";
  }

  inputEl.value += text;
  inputEl.dispatchEvent(new Event("input", { bubbles: true }));
  inputEl.dispatchEvent(new Event("change", { bubbles: true }));

  return {
    success: true,
    tagName: el.tagName.toLowerCase(),
    textContent: inputEl.value.slice(0, 200),
  };
}

/** Wait for an element to appear in the DOM */
function waitForElement(selector: string, timeout: number): Promise<ContentScriptResponse> {
  return new Promise((resolve) => {
    // Check immediately
    const existing = document.querySelector(selector);
    if (existing) {
      resolve({
        success: true,
        found: true,
        tagName: existing.tagName.toLowerCase(),
        textContent: existing.textContent?.trim().slice(0, 200) || "",
      });
      return;
    }

    const interval = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
        clearInterval(interval);
        clearTimeout(timer);
        resolve({
          success: true,
          found: true,
          tagName: el.tagName.toLowerCase(),
          textContent: el.textContent?.trim().slice(0, 200) || "",
        });
      }
    }, 200);

    const timer = setTimeout(() => {
      clearInterval(interval);
      resolve({ success: false, found: false, error: `Timeout: element "${selector}" not found within ${timeout}ms` });
    }, timeout);
  });
}
