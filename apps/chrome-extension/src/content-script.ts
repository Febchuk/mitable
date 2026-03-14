import type { ContentScriptRequest, ContentScriptResponse } from "./types";

/** Handle messages from the service worker */
chrome.runtime.onMessage.addListener(
  (
    message: ContentScriptRequest,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: ContentScriptResponse) => void
  ) => {
    if (message.type === "dom_extract") {
      try {
        const content = extractContent(message.mode, message.selector);
        sendResponse({ success: true, content });
      } catch (err) {
        sendResponse({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return true; // Keep channel open for async response
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
