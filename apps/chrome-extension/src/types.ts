/** Base message format for WebSocket protocol */
export interface BridgeMessage {
  id: string;
  type: "request" | "response" | "event";
  action: string;
  payload: unknown;
}

/** Electron → Extension */
export interface BridgeRequest extends BridgeMessage {
  type: "request";
}

/** Extension → Electron */
export interface BridgeResponse extends BridgeMessage {
  type: "response";
  success: boolean;
  error?: string;
}

/** Extension → Electron (unsolicited events) */
export interface BridgeEvent extends BridgeMessage {
  type: "event";
}

/** Connection config from bridge discovery */
export interface BridgeConfig {
  port: number;
  token: string;
  error?: string;
}

/** Content script message types */
export type ContentScriptRequest =
  | { type: "dom_extract"; mode: "text" | "structured"; selector?: string }
  | { type: "dom_click"; selector: string; text?: string }
  | { type: "dom_type"; selector: string; text: string; clear: boolean }
  | { type: "dom_wait"; selector: string; timeout: number };

export interface ContentScriptResponse {
  success: boolean;
  content?: string;
  tagName?: string;
  textContent?: string;
  found?: boolean;
  error?: string;
}
