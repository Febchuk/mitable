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

/** Connection config read from native messaging host */
export interface BridgeConfig {
  port: number;
  token: string;
  error?: string;
}

/** Content script message types */
export interface ContentScriptRequest {
  type: "dom_extract";
  mode: "text" | "structured";
  selector?: string;
}

export interface ContentScriptResponse {
  success: boolean;
  content?: string;
  error?: string;
}
