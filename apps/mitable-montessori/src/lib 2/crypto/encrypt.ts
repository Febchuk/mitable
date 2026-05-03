"use client";

import { base64ToBuffer, bufferToBase64, getSessionKeys } from "@/lib/crypto/session-key";

/**
 * Envelope format for an encrypted field:
 *   { iv: base64, ct: base64 }
 * `iv` is a fresh 12-byte nonce per call. `ct` is the AES-GCM ciphertext + tag.
 */
export interface CipherEnvelope {
  iv: string;
  ct: string;
}

export async function encryptString(plain: string): Promise<CipherEnvelope> {
  const keys = await getSessionKeys();
  if (!keys) throw new Error("Session keys not initialised; cannot encrypt.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    keys.aes,
    new TextEncoder().encode(plain)
  );
  return { iv: bufferToBase64(iv.buffer), ct: bufferToBase64(ct) };
}

export async function decryptString(envelope: CipherEnvelope): Promise<string> {
  const keys = await getSessionKeys();
  if (!keys) throw new Error("Session keys not initialised; cannot decrypt.");
  const iv = new Uint8Array(base64ToBuffer(envelope.iv));
  const ct = base64ToBuffer(envelope.ct);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, keys.aes, ct);
  return new TextDecoder().decode(plain);
}

export async function nameHash(firstName: string, lastName: string): Promise<string> {
  const keys = await getSessionKeys();
  if (!keys) throw new Error("Session keys not initialised; cannot hash name.");
  const sig = await crypto.subtle.sign(
    "HMAC",
    keys.hmac,
    new TextEncoder().encode(`${firstName.toLowerCase()}|${lastName.toLowerCase()}`)
  );
  return bufferToBase64(sig);
}
