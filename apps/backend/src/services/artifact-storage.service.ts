/**
 * Artifact Storage Service
 *
 * Handles file uploads, downloads, and deletions using Supabase Storage.
 * Provides file validation and signed URL generation.
 */

import { supabaseAdmin } from "../lib/supabase.js";
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  type AllowedMimeType,
} from "../db/schema/artifacts.schema.js";

interface UploadMetadata {
  filename: string;
  mimeType: string;
  organizationId: string;
  userId: string;
}

interface UploadResult {
  storagePath: string;
  storageUrl: string;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
}

class ArtifactStorageService {
  private bucket = "artifacts";

  /**
   * Upload an artifact to Supabase Storage
   */
  async uploadArtifact(file: Buffer, metadata: UploadMetadata): Promise<UploadResult> {
    const { filename, mimeType, organizationId, userId } = metadata;

    // Validate file before upload
    const validation = this.validateFile(file, mimeType);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Generate unique storage path: org/user/timestamp-filename
    const sanitizedFilename = this.sanitizeFilename(filename);
    const timestamp = Date.now();
    const storagePath = `${organizationId}/${userId}/${timestamp}-${sanitizedFilename}`;

    console.log(`[ArtifactStorage] Uploading to: ${storagePath}`);

    // Upload to Supabase Storage
    const { error } = await supabaseAdmin.storage.from(this.bucket).upload(storagePath, file, {
      contentType: mimeType,
      upsert: false,
    });

    if (error) {
      console.error("[ArtifactStorage] Upload failed:", error);
      throw new Error(`Upload failed: ${error.message}`);
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from(this.bucket).getPublicUrl(storagePath);

    console.log(`[ArtifactStorage] Upload successful: ${storagePath}`);

    return {
      storagePath,
      storageUrl: publicUrl,
    };
  }

  /**
   * Get a signed download URL for private bucket access
   */
  async getSignedUrl(storagePath: string, expiresIn = 3600): Promise<string> {
    const { data, error } = await supabaseAdmin.storage
      .from(this.bucket)
      .createSignedUrl(storagePath, expiresIn);

    if (error) {
      console.error("[ArtifactStorage] Failed to create signed URL:", error);
      throw new Error(`Failed to create signed URL: ${error.message}`);
    }

    return data.signedUrl;
  }

  /**
   * Get public URL for public bucket access
   */
  getPublicUrl(storagePath: string): string {
    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from(this.bucket).getPublicUrl(storagePath);

    return publicUrl;
  }

  /**
   * Download artifact file from storage
   */
  async downloadArtifact(storagePath: string): Promise<Buffer> {
    const { data, error } = await supabaseAdmin.storage.from(this.bucket).download(storagePath);

    if (error) {
      console.error("[ArtifactStorage] Download failed:", error);
      throw new Error(`Download failed: ${error.message}`);
    }

    // Convert Blob to Buffer
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Delete an artifact from storage
   */
  async deleteArtifact(storagePath: string): Promise<void> {
    console.log(`[ArtifactStorage] Deleting: ${storagePath}`);

    const { error } = await supabaseAdmin.storage.from(this.bucket).remove([storagePath]);

    if (error) {
      console.error("[ArtifactStorage] Delete failed:", error);
      throw new Error(`Delete failed: ${error.message}`);
    }

    console.log(`[ArtifactStorage] Deleted: ${storagePath}`);
  }

  /**
   * Delete multiple artifacts from storage
   */
  async deleteMultipleArtifacts(storagePaths: string[]): Promise<void> {
    if (storagePaths.length === 0) return;

    console.log(`[ArtifactStorage] Deleting ${storagePaths.length} artifacts`);

    const { error } = await supabaseAdmin.storage.from(this.bucket).remove(storagePaths);

    if (error) {
      console.error("[ArtifactStorage] Bulk delete failed:", error);
      throw new Error(`Bulk delete failed: ${error.message}`);
    }

    console.log(`[ArtifactStorage] Deleted ${storagePaths.length} artifacts`);
  }

  /**
   * Validate file before upload
   */
  validateFile(file: Buffer | { size: number; mimeType: string }, mimeType?: string): ValidationResult {
    // Handle both Buffer and metadata object
    const size = Buffer.isBuffer(file) ? file.length : file.size;
    const type = mimeType || (Buffer.isBuffer(file) ? undefined : file.mimeType);

    // Check file size
    if (size > MAX_FILE_SIZE_BYTES) {
      const maxMB = MAX_FILE_SIZE_BYTES / (1024 * 1024);
      const fileMB = (size / (1024 * 1024)).toFixed(2);
      return {
        valid: false,
        error: `File too large (${fileMB}MB). Maximum allowed: ${maxMB}MB`,
      };
    }

    // Check MIME type
    if (type && !ALLOWED_MIME_TYPES.includes(type as AllowedMimeType)) {
      return {
        valid: false,
        error: `Unsupported file type: ${type}. Allowed types: PDF, DOCX, TXT, Markdown, PNG, JPEG, GIF, WebP`,
      };
    }

    return { valid: true };
  }

  /**
   * Check if MIME type supports text extraction
   */
  supportsTextExtraction(mimeType: string): boolean {
    const textExtractionTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/markdown",
    ];
    return textExtractionTypes.includes(mimeType);
  }

  /**
   * Check if MIME type is an image
   */
  isImageType(mimeType: string): boolean {
    return mimeType.startsWith("image/");
  }

  /**
   * Sanitize filename for storage path
   */
  private sanitizeFilename(filename: string): string {
    // Remove path separators and special characters
    return filename
      .replace(/[/\\]/g, "-")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 200); // Limit length
  }

  /**
   * Get file extension from filename
   */
  getFileExtension(filename: string): string {
    const parts = filename.split(".");
    return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
  }

  /**
   * Get MIME type from file extension (fallback)
   */
  getMimeTypeFromExtension(extension: string): string | null {
    const mimeMap: Record<string, string> = {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      txt: "text/plain",
      md: "text/markdown",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
    };
    return mimeMap[extension.toLowerCase()] || null;
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}

// Export singleton
export const artifactStorageService = new ArtifactStorageService();
