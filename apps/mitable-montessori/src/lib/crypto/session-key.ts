"use client";

/**
 * Derives an AES-GCM encryption key from the user's session JWT subject and a
 * per-school salt fetched from the server. Caches the key (as JWK) in
 * sessionStorage so it survives navigation but is cleared on tab close / logout.
 *
 * The same derivation also produces a separate HMAC key used as a search index
 * seed for Fuse.js (so we can index by name without storing plaintext on disk).
 */

const STORAGE_KEY = "mtm:crypto:session-keys-v1";

interface CachedKeys {
  aesJwk: JsonWebKey;
  hmacJwk: JsonWebKey;
  schoolId: string;
  userId: string;
}

let inMemory: { aes: CryptoKey; hmac: CryptoKey } | null = null;

async function deriveKeys(userId: string, schoolId: string, saltB64: string) {
  const enc = new TextEncoder();
  const salt = base64ToBuffer(saltB64);

  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(`${userId}:${schoolId}`),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const aes = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 200_000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  const hmacBaseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(`hmac:${userId}:${schoolId}`),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const hmac = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 200_000,
      hash: "SHA-256",
    },
    hmacBaseKey,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    true,
    ["sign", "verify"]
  );

  return { aes, hmac };
}

export async function initSessionKeys(opts: { userId: string; schoolId: string; saltB64: string }) {
  const { aes, hmac } = await deriveKeys(opts.userId, opts.schoolId, opts.saltB64);
  inMemory = { aes, hmac };
  const aesJwk = await crypto.subtle.exportKey("jwk", aes);
  const hmacJwk = await crypto.subtle.exportKey("jwk", hmac);
  const cached: CachedKeys = { aesJwk, hmacJwk, schoolId: opts.schoolId, userId: opts.userId };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
}

export async function getSessionKeys() {
  if (inMemory) return inMemory;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const cached = JSON.parse(raw) as CachedKeys;
    const aes = await crypto.subtle.importKey(
      "jwk",
      cached.aesJwk,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    const hmac = await crypto.subtle.importKey(
      "jwk",
      cached.hmacJwk,
      { name: "HMAC", hash: "SHA-256" },
      true,
      ["sign", "verify"]
    );
    inMemory = { aes, hmac };
    return inMemory;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function clearSessionKeys() {
  inMemory = null;
  sessionStorage.removeItem(STORAGE_KEY);
}

export function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
