import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";

// Node's webcrypto only ships in `globalThis.crypto` from Node 19+ — defensive
// import for older runners. PBKDF2/AES-GCM (lib/crypto/encrypt.ts +
// session-key.ts) require subtle.
if (!globalThis.crypto || !globalThis.crypto.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
}

// `lib/crypto/session-key.ts` writes session keys to sessionStorage. The node
// test environment doesn't ship one, so polyfill a tiny in-memory shim.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}

if (typeof globalThis.sessionStorage === "undefined") {
  Object.defineProperty(globalThis, "sessionStorage", {
    value: new MemoryStorage(),
    configurable: true,
  });
}

// `lib/sync/worker.ts` runs `addEventListener('online', …)` on `window`. In
// node env, give it a no-op surface so importing the module doesn't blow up.
if (typeof globalThis.window === "undefined") {
  Object.defineProperty(globalThis, "window", {
    value: {
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    configurable: true,
  });
}

// btoa / atob exist on Node 16+, but not in some test workers. Polyfill if missing.
if (typeof globalThis.btoa === "undefined") {
  globalThis.btoa = (s: string) => Buffer.from(s, "binary").toString("base64");
}
if (typeof globalThis.atob === "undefined") {
  globalThis.atob = (s: string) => Buffer.from(s, "base64").toString("binary");
}
