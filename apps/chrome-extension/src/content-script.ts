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

      case "dom_scroll":
        try {
          const result = scrollPage(message.direction, message.amount, message.selector, message.position);
          sendResponse(result);
        } catch (err) {
          sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
        }
        return true;

      case "dom_select":
        try {
          const result = selectOption(message.selector, message.value);
          sendResponse(result);
        } catch (err) {
          sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
        }
        return true;

      case "dom_hover":
        try {
          const result = hoverElement(message.selector);
          sendResponse(result);
        } catch (err) {
          sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
        }
        return true;

      case "dom_read_element":
        try {
          const result = readElement(message.selector, message.properties);
          sendResponse(result);
        } catch (err) {
          sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
        }
        return true;

      case "dom_keyboard":
        try {
          const result = sendKeyboardEvent(message.key, message.modifiers);
          sendResponse(result);
        } catch (err) {
          sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
        }
        return true;
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

/** Scroll the page */
function scrollPage(
  direction?: "up" | "down",
  amount?: number,
  selector?: string,
  position?: "top" | "bottom"
): ContentScriptResponse {
  if (selector) {
    const el = document.querySelector(selector);
    if (!el) return { success: false, error: `No element found for selector: ${selector}` };
    el.scrollIntoView({ block: "center", behavior: "instant" });
    return {
      success: true,
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      tagName: el.tagName.toLowerCase(),
      textContent: el.textContent?.trim().slice(0, 200) || "",
    };
  }

  if (position === "top") {
    window.scrollTo({ top: 0, behavior: "instant" });
  } else if (position === "bottom") {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
  } else {
    const pixels = amount ?? Math.floor(window.innerHeight * 0.8);
    const scrollAmount = direction === "up" ? -pixels : pixels;
    window.scrollBy({ top: scrollAmount, behavior: "instant" });
  }

  return {
    success: true,
    scrollY: window.scrollY,
    scrollHeight: document.documentElement.scrollHeight,
  };
}

/** Select an option from a <select> element */
function selectOption(selector: string, value: string): ContentScriptResponse {
  const el = document.querySelector(selector);
  if (!el) return { success: false, error: `No element found for selector: ${selector}` };
  if (el.tagName.toLowerCase() !== "select") {
    return { success: false, error: `Element is <${el.tagName.toLowerCase()}>, not <select>` };
  }

  const selectEl = el as HTMLSelectElement;
  const options = Array.from(selectEl.options);

  // Match by value first, then by visible text (case-insensitive)
  const match =
    options.find((o) => o.value === value) ||
    options.find((o) => o.textContent?.trim().toLowerCase() === value.toLowerCase());

  if (!match) {
    const available = options.map((o) => `"${o.textContent?.trim()}" (value="${o.value}")`).join(", ");
    return { success: false, error: `No option matching "${value}". Available: ${available}` };
  }

  selectEl.value = match.value;
  selectEl.dispatchEvent(new Event("change", { bubbles: true }));
  selectEl.dispatchEvent(new Event("input", { bubbles: true }));

  return {
    success: true,
    tagName: "option",
    textContent: match.textContent?.trim() || "",
  };
}

/** Hover over an element to trigger hover effects */
function hoverElement(selector: string): ContentScriptResponse {
  const el = document.querySelector(selector);
  if (!el) return { success: false, error: `No element found for selector: ${selector}` };

  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const eventInit: MouseEventInit = { bubbles: true, clientX: cx, clientY: cy };
  el.dispatchEvent(new MouseEvent("mouseenter", eventInit));
  el.dispatchEvent(new MouseEvent("mouseover", eventInit));
  el.dispatchEvent(new MouseEvent("mousemove", eventInit));

  return {
    success: true,
    tagName: el.tagName.toLowerCase(),
    textContent: el.textContent?.trim().slice(0, 200) || "",
  };
}

/** Read properties from an element */
function readElement(selector: string, properties?: string[]): ContentScriptResponse {
  const el = document.querySelector(selector);
  if (!el) return { success: false, error: `No element found for selector: ${selector}` };

  const defaultProps = [
    "tagName", "id", "className", "textContent", "value",
    "href", "src", "disabled", "checked", "type", "placeholder",
  ];
  const props = properties && properties.length > 0 ? properties : defaultProps;

  const attrs: Record<string, unknown> = {};
  for (const prop of props) {
    if (prop === "textContent") {
      attrs[prop] = (el.textContent?.trim() || "").slice(0, 500);
    } else if (prop === "boundingRect") {
      attrs[prop] = el.getBoundingClientRect().toJSON();
    } else if (prop === "computedStyle") {
      const style = window.getComputedStyle(el);
      attrs[prop] = {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        color: style.color,
        backgroundColor: style.backgroundColor,
      };
    } else if (prop in el) {
      const val = (el as Record<string, unknown>)[prop];
      if (typeof val !== "function") attrs[prop] = val;
    } else {
      const attrVal = el.getAttribute(prop);
      if (attrVal !== null) attrs[prop] = attrVal;
    }
  }

  return {
    success: true,
    tagName: el.tagName.toLowerCase(),
    attributes: attrs,
  };
}

/** Send keyboard events to the focused element */
function sendKeyboardEvent(key: string, modifiers?: ("ctrl" | "shift" | "alt" | "meta")[]): ContentScriptResponse {
  const target = document.activeElement || document.body;
  const mods = modifiers || [];

  const eventInit: KeyboardEventInit = {
    key,
    code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
    bubbles: true,
    cancelable: true,
    ctrlKey: mods.includes("ctrl"),
    shiftKey: mods.includes("shift"),
    altKey: mods.includes("alt"),
    metaKey: mods.includes("meta"),
  };

  target.dispatchEvent(new KeyboardEvent("keydown", eventInit));
  target.dispatchEvent(new KeyboardEvent("keyup", eventInit));

  // Special handling: Enter on input inside a form → submit
  if (key === "Enter" && target instanceof HTMLInputElement && target.form) {
    target.form.requestSubmit();
  }

  // Special handling: Escape closes open dialogs
  if (key === "Escape") {
    const dialog = document.querySelector("dialog[open]") as HTMLDialogElement | null;
    if (dialog) dialog.close();
  }

  return {
    success: true,
    tagName: (target as HTMLElement).tagName?.toLowerCase() || "body",
    textContent: (target as HTMLElement).textContent?.trim().slice(0, 200) || "",
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
