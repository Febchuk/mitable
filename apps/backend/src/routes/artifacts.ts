/**
 * Artifacts Routes
 *
 * CRUD endpoints for managing uploaded artifacts (PDFs, DOCX, images, etc.)
 * that can be used as source material for document generation.
 */

import { Router, Request, Response } from "express";
import { eq, sql, desc, and } from "drizzle-orm";
import multer from "multer";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { requireAuth } from "../middleware/auth.js";
import { artifactStorageService } from "../services/artifact-storage.service.js";
import { documentExtractionService } from "../services/document-extraction.service.js";
import { artifactEmbeddingService } from "../services/artifact-embedding.service.js";
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  AllowedMimeType,
} from "../db/schema/artifacts.schema.js";

const router = Router();

// Multer file type (for memory storage)
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  destination?: string;
  filename?: string;
  path?: string;
}

// Request with multer file (using type intersection to avoid extends issues)
type RequestWithFile = Request & { file?: MulterFile };

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype as AllowedMimeType)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Unsupported file type: ${file.mimetype}. Allowed: PDF, DOCX, TXT, Markdown, PNG, JPEG, GIF, WebP`
        )
      );
    }
  },
});

/**
 * POST /api/artifacts
 * Upload a new artifact
 */
router.post(
  "/",
  requireAuth,
  upload.single("file"),
  async (req: RequestWithFile, res: Response): Promise<void> => {
    const userId = req.userId!;
    const file = req.file;

    if (!file) {
      res.status(400).json({
        error: "Bad Request",
        message: "No file uploaded",
      });
      return;
    }

    try {
      // Get user's organization
      const [user] = await db
        .select({ organizationId: schema.users.organizationId })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!user?.organizationId) {
        res.status(400).json({
          error: "Bad Request",
          message: "User organization not found",
        });
        return;
      }

      const organizationId = user.organizationId;

      console.log(
        `[Artifacts] Uploading file: ${file.originalname} (${file.mimetype}, ${file.size} bytes)`
      );

      // Upload to Supabase Storage
      const { storagePath, storageUrl } = await artifactStorageService.uploadArtifact(file.buffer, {
        filename: file.originalname,
        mimeType: file.mimetype,
        organizationId,
        userId,
      });

      // Create artifact record (text extraction pending)
      const [artifact] = await db
        .insert(schema.artifacts)
        .values({
          organizationId,
          uploadedBy: userId,
          filename: file.originalname,
          mimeType: file.mimetype,
          storageUrl,
          storageKey: storagePath,
          fileSizeBytes: file.size,
          extractionStatus: documentExtractionService.supportsExtraction(file.mimetype)
            ? "pending"
            : "skipped",
          embeddingStatus: "pending",
        })
        .returning();

      console.log(`[Artifacts] Created artifact: ${artifact.id}`);

      // Process text extraction asynchronously
      if (documentExtractionService.supportsExtraction(file.mimetype)) {
        // Don't await - let it run in background
        processArtifactText(artifact.id, file.buffer, file.mimetype, {
          organizationId,
          filename: file.originalname,
        }).catch((error) => {
          console.error(`[Artifacts] Background processing failed for ${artifact.id}:`, error);
        });
      } else {
        // Skip extraction for images
        await db
          .update(schema.artifacts)
          .set({ extractionStatus: "skipped", embeddingStatus: "skipped" })
          .where(eq(schema.artifacts.id, artifact.id));
      }

      res.status(201).json({
        success: true,
        artifact: {
          ...artifact,
          fileSizeFormatted: artifactStorageService.formatFileSize(file.size),
        },
      });
    } catch (error) {
      console.error("[Artifacts] Upload failed:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to upload artifact",
      });
    }
  }
);

/**
 * GET /api/artifacts
 * List user's artifacts with pagination
 */
router.get("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  try {
    // Get user's organization
    const [user] = await db
      .select({ organizationId: schema.users.organizationId })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user?.organizationId) {
      res.status(400).json({
        error: "Bad Request",
        message: "User organization not found",
      });
      return;
    }

    const organizationId = user.organizationId;

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.artifacts)
      .where(
        and(
          eq(schema.artifacts.organizationId, organizationId),
          eq(schema.artifacts.uploadedBy, userId)
        )
      );

    const totalPages = Math.ceil(count / limit);

    // Get artifacts
    const artifacts = await db
      .select()
      .from(schema.artifacts)
      .where(
        and(
          eq(schema.artifacts.organizationId, organizationId),
          eq(schema.artifacts.uploadedBy, userId)
        )
      )
      .orderBy(desc(schema.artifacts.createdAt))
      .limit(limit)
      .offset(offset);

    // Transform with formatted file sizes
    const transformedArtifacts = artifacts.map((a) => ({
      ...a,
      fileSizeFormatted: artifactStorageService.formatFileSize(a.fileSizeBytes),
      hasExtractedText: !!a.extractedText && a.extractedText.length > 0,
      textPreview: a.extractedText ? a.extractedText.substring(0, 200) + "..." : null,
    }));

    res.json({
      artifacts: transformedArtifacts,
      pagination: {
        page,
        limit,
        total: count,
        totalPages,
      },
    });
  } catch (error) {
    console.error("[Artifacts] Error listing artifacts:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to list artifacts",
    });
  }
});

/**
 * GET /api/artifacts/:id
 * Get a single artifact with signed download URL
 */
router.get("/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const artifactId = req.params.id;

  try {
    // Get user's organization
    const [user] = await db
      .select({ organizationId: schema.users.organizationId })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user?.organizationId) {
      res.status(400).json({
        error: "Bad Request",
        message: "User organization not found",
      });
      return;
    }

    // Get artifact
    const [artifact] = await db
      .select()
      .from(schema.artifacts)
      .where(
        and(
          eq(schema.artifacts.id, artifactId),
          eq(schema.artifacts.organizationId, user.organizationId)
        )
      )
      .limit(1);

    if (!artifact) {
      res.status(404).json({
        error: "Not Found",
        message: "Artifact not found",
      });
      return;
    }

    // Generate signed URL for download (1 hour expiry)
    let downloadUrl = artifact.storageUrl;
    try {
      downloadUrl = await artifactStorageService.getSignedUrl(artifact.storageKey, 3600);
    } catch {
      // Fall back to public URL if signed URL fails
      downloadUrl = artifact.storageUrl;
    }

    res.json({
      ...artifact,
      downloadUrl,
      fileSizeFormatted: artifactStorageService.formatFileSize(artifact.fileSizeBytes),
    });
  } catch (error) {
    console.error("[Artifacts] Error getting artifact:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to get artifact",
    });
  }
});

/**
 * GET /api/artifacts/:id/text
 * Get extracted text preview for an artifact
 */
router.get("/:id/text", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const artifactId = req.params.id;

  try {
    // Get user's organization
    const [user] = await db
      .select({ organizationId: schema.users.organizationId })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user?.organizationId) {
      res.status(400).json({
        error: "Bad Request",
        message: "User organization not found",
      });
      return;
    }

    // Get artifact
    const [artifact] = await db
      .select({
        id: schema.artifacts.id,
        filename: schema.artifacts.filename,
        extractedText: schema.artifacts.extractedText,
        extractionStatus: schema.artifacts.extractionStatus,
      })
      .from(schema.artifacts)
      .where(
        and(
          eq(schema.artifacts.id, artifactId),
          eq(schema.artifacts.organizationId, user.organizationId)
        )
      )
      .limit(1);

    if (!artifact) {
      res.status(404).json({
        error: "Not Found",
        message: "Artifact not found",
      });
      return;
    }

    res.json({
      id: artifact.id,
      filename: artifact.filename,
      extractedText: artifact.extractedText,
      extractionStatus: artifact.extractionStatus,
      wordCount: artifact.extractedText
        ? artifact.extractedText.split(/\s+/).filter((w) => w.length > 0).length
        : 0,
    });
  } catch (error) {
    console.error("[Artifacts] Error getting text:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to get artifact text",
    });
  }
});

/**
 * DELETE /api/artifacts/:id
 * Delete an artifact (Supabase Storage + Pinecone + DB)
 */
router.delete("/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const artifactId = req.params.id;

  try {
    // Get user's organization
    const [user] = await db
      .select({ organizationId: schema.users.organizationId })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user?.organizationId) {
      res.status(400).json({
        error: "Bad Request",
        message: "User organization not found",
      });
      return;
    }

    // Get artifact
    const [artifact] = await db
      .select()
      .from(schema.artifacts)
      .where(
        and(
          eq(schema.artifacts.id, artifactId),
          eq(schema.artifacts.organizationId, user.organizationId)
        )
      )
      .limit(1);

    if (!artifact) {
      res.status(404).json({
        error: "Not Found",
        message: "Artifact not found",
      });
      return;
    }

    console.log(`[Artifacts] Deleting artifact: ${artifactId}`);

    // Delete from Pinecone (if embeddings exist)
    try {
      await artifactEmbeddingService.deleteArtifactEmbeddings(artifactId);
    } catch (error) {
      console.warn(`[Artifacts] Failed to delete embeddings for ${artifactId}:`, error);
      // Continue with deletion even if Pinecone delete fails
    }

    // Delete from Supabase Storage
    try {
      await artifactStorageService.deleteArtifact(artifact.storageKey);
    } catch (error) {
      console.warn(`[Artifacts] Failed to delete storage for ${artifactId}:`, error);
      // Continue with DB deletion even if storage delete fails
    }

    // Delete from database (cascades to document_artifact_sources)
    await db.delete(schema.artifacts).where(eq(schema.artifacts.id, artifactId));

    console.log(`[Artifacts] Deleted artifact: ${artifactId}`);

    res.json({
      success: true,
      message: "Artifact deleted",
    });
  } catch (error) {
    console.error("[Artifacts] Error deleting artifact:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to delete artifact",
    });
  }
});

/**
 * Background function to process artifact text extraction and embeddings
 */
async function processArtifactText(
  artifactId: string,
  buffer: Buffer,
  mimeType: string,
  metadata: { organizationId: string; filename: string }
): Promise<void> {
  console.log(`[Artifacts] Processing text for artifact: ${artifactId}`);

  try {
    // Update status to processing
    await db
      .update(schema.artifacts)
      .set({ extractionStatus: "processing" })
      .where(eq(schema.artifacts.id, artifactId));

    // Extract text
    const { text, metadata: extractionMetadata } = await documentExtractionService.extractText(
      buffer,
      mimeType
    );

    // Update with extracted text
    await db
      .update(schema.artifacts)
      .set({
        extractedText: text,
        extractionStatus: text ? "completed" : "skipped",
        metadata: extractionMetadata,
        updatedAt: new Date(),
      })
      .where(eq(schema.artifacts.id, artifactId));

    console.log(`[Artifacts] Text extraction completed for: ${artifactId}`);

    // Generate embeddings if text was extracted
    if (text && artifactEmbeddingService.shouldGenerateEmbeddings(text)) {
      try {
        await artifactEmbeddingService.generateAndStoreEmbeddings(artifactId, text, metadata);
        console.log(`[Artifacts] Embeddings generated for: ${artifactId}`);
      } catch (error) {
        console.error(`[Artifacts] Embedding generation failed for ${artifactId}:`, error);
        // Embedding failure is non-critical, continue
      }
    } else {
      // Skip embedding for short text or images
      await db
        .update(schema.artifacts)
        .set({ embeddingStatus: "skipped" })
        .where(eq(schema.artifacts.id, artifactId));
    }
  } catch (error) {
    console.error(`[Artifacts] Text processing failed for ${artifactId}:`, error);

    // Update status to failed
    await db
      .update(schema.artifacts)
      .set({
        extractionStatus: "failed",
        extractionError: error instanceof Error ? error.message : "Unknown error",
        embeddingStatus: "skipped",
        updatedAt: new Date(),
      })
      .where(eq(schema.artifacts.id, artifactId));
  }
}

export default router;
