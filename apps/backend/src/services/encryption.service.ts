import crypto from "crypto";

/**
 * Encryption Service using AES-256-GCM
 *
 * Provides authenticated encryption for sensitive data like access tokens.
 * Uses industry-standard AES-256-GCM with:
 * - 256-bit key (32 bytes)
 * - 12-byte random IV (initialization vector) per encryption
 * - 16-byte authentication tag (prevents tampering)
 *
 * Storage format: iv:authTag:ciphertext (all hex-encoded)
 *
 * Performance: <5ms per encrypt/decrypt operation
 * Security: NIST-approved authenticated encryption
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 12 bytes for GCM (NIST recommendation)
const AUTH_TAG_LENGTH = 16; // 16 bytes for GCM
const KEY_LENGTH = 32; // 32 bytes (256 bits)

class EncryptionService {
  private key: Buffer;

  constructor() {
    this.validateEnvironment();
    const keyHex = process.env.ENCRYPTION_KEY!;
    this.key = Buffer.from(keyHex, "hex");
  }

  /**
   * Validate that encryption key is properly configured
   * @throws Error if ENCRYPTION_KEY is missing or invalid
   */
  private validateEnvironment(): void {
    const keyHex = process.env.ENCRYPTION_KEY;

    if (!keyHex) {
      throw new Error(
        "ENCRYPTION_KEY environment variable not set. " +
          "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
      );
    }

    if (typeof keyHex !== "string" || keyHex.length !== KEY_LENGTH * 2) {
      throw new Error(
        `ENCRYPTION_KEY must be ${KEY_LENGTH * 2} hex characters (${KEY_LENGTH} bytes). ` +
          `Current length: ${keyHex.length}`
      );
    }

    // Validate hex format
    if (!/^[0-9a-f]{64}$/i.test(keyHex)) {
      throw new Error("ENCRYPTION_KEY must be valid hexadecimal string");
    }
  }

  /**
   * Encrypt plaintext using AES-256-GCM
   *
   * @param plaintext - The sensitive data to encrypt (e.g., access token)
   * @returns Encrypted string in format "iv:authTag:ciphertext" (hex-encoded)
   *
   * @example
   * const encrypted = encryptionService.encrypt("xoxb-slack-token-123");
   * // Returns: "a1b2c3d4e5f6...:{authTag}:{ciphertext}"
   */
  encrypt(plaintext: string): string {
    if (!plaintext || typeof plaintext !== "string") {
      throw new Error("Plaintext must be a non-empty string");
    }

    // Generate random IV for this encryption operation
    // CRITICAL: Must be random and unique per encryption
    const iv = crypto.randomBytes(IV_LENGTH);

    // Create cipher with key and IV
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);

    // Encrypt the plaintext
    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");

    // Get authentication tag (prevents tampering)
    const authTag = cipher.getAuthTag();

    // Return format: iv:authTag:ciphertext (all hex-encoded)
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  }

  /**
   * Decrypt ciphertext using AES-256-GCM
   *
   * @param encrypted - Encrypted string in format "iv:authTag:ciphertext"
   * @returns Decrypted plaintext
   * @throws Error if encrypted data is invalid or tampered with
   *
   * @example
   * const decrypted = encryptionService.decrypt("a1b2c3...:{authTag}:{ciphertext}");
   * // Returns: "xoxb-slack-token-123"
   */
  decrypt(encrypted: string): string {
    if (!encrypted || typeof encrypted !== "string") {
      throw new Error("Encrypted data must be a non-empty string");
    }

    // Parse the encrypted format: iv:authTag:ciphertext
    const parts = encrypted.split(":");
    if (parts.length !== 3) {
      throw new Error(
        "Invalid encrypted format. Expected 'iv:authTag:ciphertext' with 3 parts, " +
          `got ${parts.length} parts`
      );
    }

    const [ivHex, authTagHex, ciphertext] = parts;

    if (!ivHex || !authTagHex || !ciphertext) {
      throw new Error("Encrypted data contains empty components");
    }

    try {
      // Convert hex strings back to buffers
      const iv = Buffer.from(ivHex, "hex");
      const authTag = Buffer.from(authTagHex, "hex");

      // Validate lengths
      if (iv.length !== IV_LENGTH) {
        throw new Error(`Invalid IV length: expected ${IV_LENGTH} bytes, got ${iv.length}`);
      }

      if (authTag.length !== AUTH_TAG_LENGTH) {
        throw new Error(
          `Invalid auth tag length: expected ${AUTH_TAG_LENGTH} bytes, got ${authTag.length}`
        );
      }

      // Create decipher
      const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);

      // Set authentication tag (will throw if tampered)
      decipher.setAuthTag(authTag);

      // Decrypt
      let decrypted = decipher.update(ciphertext, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (error) {
      // Re-throw validation errors as-is (they already have good messages)
      if (error instanceof Error && error.message.startsWith("Invalid")) {
        throw error;
      }

      // Authentication tag verification failure or crypto errors
      // Node crypto throws various error codes/messages for auth failures
      if (error instanceof Error) {
        const errorStr = error.message.toLowerCase();
        if (
          errorStr.includes("auth") ||
          errorStr.includes("unsupported state") ||
          errorStr.includes("bad decrypt")
        ) {
          throw new Error("Authentication failed: encrypted data may have been tampered with");
        }
        // Re-throw with context
        throw new Error(`Decryption failed: ${error.message}`);
      }

      // Handle non-Error objects (should be rare, but crypto can throw various types)
      // Default to authentication failure for crypto-related errors
      throw new Error("Authentication failed: encrypted data may have been tampered with");
    }
  }

  /**
   * Test if encryption service is properly configured
   * @returns true if service is operational
   */
  isConfigured(): boolean {
    try {
      this.validateEnvironment();
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton instance
export const encryptionService = new EncryptionService();
