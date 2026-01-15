import { Router, Request, Response } from "express";
import { eq, sql, desc, and, ilike, or } from "drizzle-orm";
import { db } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { requireAuth } from "../middleware/auth.js";
import type {
  DocType,
  DocStatus,
  CreateDocumentRequest,
  UpdateDocumentRequest,
  ReviseDocumentRequest,
} from "@mitable/shared";

const router = Router();

/**
 * GET /api/documents
 * List all documents for user's organization with pagination and filtering
 */
router.get("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  const docType = req.query.docType as DocType | undefined;
  const status = req.query.status as DocStatus | undefined;
  const search = req.query.search as string | undefined;

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

    // Build conditions
    const conditions = [eq(schema.documents.organizationId, organizationId)];

    if (docType) {
      conditions.push(eq(schema.documents.docType, docType));
    }

    if (status) {
      conditions.push(eq(schema.documents.status, status));
    }

    if (search) {
      conditions.push(
        or(
          ilike(schema.documents.title, `%${search}%`),
          ilike(schema.documents.description, `%${search}%`)
        )!
      );
    }

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.documents)
      .where(and(...conditions));

    const totalPages = Math.ceil(count / limit);

    // Get documents with creator info
    const documents = await db
      .select({
        id: schema.documents.id,
        organizationId: schema.documents.organizationId,
        createdBy: schema.documents.createdBy,
        title: schema.documents.title,
        docType: schema.documents.docType,
        status: schema.documents.status,
        description: schema.documents.description,
        tags: schema.documents.tags,
        notionPageId: schema.documents.notionPageId,
        notionSyncStatus: schema.documents.notionSyncStatus,
        notionSyncedAt: schema.documents.notionSyncedAt,
        createdAt: schema.documents.createdAt,
        updatedAt: schema.documents.updatedAt,
        publishedAt: schema.documents.publishedAt,
        creatorFirstName: schema.users.firstName,
        creatorLastName: schema.users.lastName,
        creatorEmail: schema.users.email,
      })
      .from(schema.documents)
      .leftJoin(schema.users, eq(schema.documents.createdBy, schema.users.id))
      .where(and(...conditions))
      .orderBy(desc(schema.documents.updatedAt))
      .limit(limit)
      .offset(offset);

    // Transform response
    const transformedDocs = documents.map((doc) => ({
      id: doc.id,
      organizationId: doc.organizationId,
      createdBy: doc.createdBy,
      title: doc.title,
      docType: doc.docType,
      status: doc.status,
      description: doc.description,
      tags: doc.tags,
      notionPageId: doc.notionPageId,
      notionSyncStatus: doc.notionSyncStatus,
      notionSyncedAt: doc.notionSyncedAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      publishedAt: doc.publishedAt,
      creator: doc.creatorFirstName
        ? {
            id: doc.createdBy,
            firstName: doc.creatorFirstName,
            lastName: doc.creatorLastName,
            email: doc.creatorEmail,
          }
        : undefined,
    }));

    res.json({
      documents: transformedDocs,
      pagination: {
        page,
        limit,
        total: count,
        totalPages,
      },
    });
  } catch (error) {
    console.error("[Documents] Error listing documents:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to list documents",
    });
  }
});

/**
 * GET /api/documents/:id
 * Get a single document with full content
 */
router.get("/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const documentId = req.params.id;

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

    // Get document with creator info
    const [document] = await db
      .select({
        id: schema.documents.id,
        organizationId: schema.documents.organizationId,
        createdBy: schema.documents.createdBy,
        title: schema.documents.title,
        docType: schema.documents.docType,
        status: schema.documents.status,
        description: schema.documents.description,
        tags: schema.documents.tags,
        content: schema.documents.content,
        notionPageId: schema.documents.notionPageId,
        notionSyncStatus: schema.documents.notionSyncStatus,
        notionSyncedAt: schema.documents.notionSyncedAt,
        notionSyncError: schema.documents.notionSyncError,
        generationModel: schema.documents.generationModel,
        generationPromptVersion: schema.documents.generationPromptVersion,
        createdAt: schema.documents.createdAt,
        updatedAt: schema.documents.updatedAt,
        publishedAt: schema.documents.publishedAt,
        creatorFirstName: schema.users.firstName,
        creatorLastName: schema.users.lastName,
        creatorEmail: schema.users.email,
      })
      .from(schema.documents)
      .leftJoin(schema.users, eq(schema.documents.createdBy, schema.users.id))
      .where(
        and(
          eq(schema.documents.id, documentId),
          eq(schema.documents.organizationId, user.organizationId)
        )
      )
      .limit(1);

    if (!document) {
      res.status(404).json({
        error: "Not Found",
        message: "Document not found",
      });
      return;
    }

    // Get session contributions
    const contributions = await db
      .select({
        id: schema.sessionDocumentContributions.id,
        sessionId: schema.sessionDocumentContributions.sessionId,
        contributionType: schema.sessionDocumentContributions.contributionType,
        insightsUsed: schema.sessionDocumentContributions.insightsUsed,
        createdAt: schema.sessionDocumentContributions.createdAt,
        sessionName: schema.monitoringSessions.name,
        sessionStartedAt: schema.monitoringSessions.startedAt,
        sessionEndedAt: schema.monitoringSessions.endedAt,
      })
      .from(schema.sessionDocumentContributions)
      .leftJoin(
        schema.monitoringSessions,
        eq(schema.sessionDocumentContributions.sessionId, schema.monitoringSessions.id)
      )
      .where(eq(schema.sessionDocumentContributions.documentId, documentId))
      .orderBy(desc(schema.sessionDocumentContributions.createdAt));

    res.json({
      ...document,
      creator: document.creatorFirstName
        ? {
            id: document.createdBy,
            firstName: document.creatorFirstName,
            lastName: document.creatorLastName,
            email: document.creatorEmail,
          }
        : undefined,
      sessionContributions: contributions.map((c) => ({
        id: c.id,
        sessionId: c.sessionId,
        contributionType: c.contributionType,
        insightsUsed: c.insightsUsed,
        createdAt: c.createdAt,
        session:
          c.sessionName !== undefined
            ? {
                id: c.sessionId,
                name: c.sessionName,
                startedAt: c.sessionStartedAt,
                endedAt: c.sessionEndedAt,
              }
            : undefined,
      })),
    });
  } catch (error) {
    console.error("[Documents] Error getting document:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to get document",
    });
  }
});

/**
 * POST /api/documents
 * Create a new document manually
 */
router.post("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const body: CreateDocumentRequest = req.body;

  const { title, docType, content, description, tags, status } = body;

  if (!title || !docType || !content) {
    res.status(400).json({
      error: "Bad Request",
      message: "title, docType, and content are required",
    });
    return;
  }

  // Validate docType
  const validDocTypes = ["how-to", "knowledge-article", "troubleshooting"];
  if (!validDocTypes.includes(docType)) {
    res.status(400).json({
      error: "Bad Request",
      message: `Invalid docType. Must be one of: ${validDocTypes.join(", ")}`,
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

    // Create document
    const [document] = await db
      .insert(schema.documents)
      .values({
        organizationId: user.organizationId,
        createdBy: userId,
        title,
        docType,
        content,
        description: description || null,
        tags: tags || [],
        status: status || "draft",
      })
      .returning();

    // Create initial version
    await db.insert(schema.documentVersions).values({
      documentId: document.id,
      version: 1,
      content,
      changeType: "created",
      changedBy: userId,
      changeSummary: "Document created",
    });

    console.log(`[Documents] Document created: ${document.id}`);

    res.status(201).json({
      success: true,
      document,
    });
  } catch (error) {
    console.error("[Documents] Error creating document:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to create document",
    });
  }
});

/**
 * PATCH /api/documents/:id
 * Update a document
 */
router.patch("/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const documentId = req.params.id;
  const body: UpdateDocumentRequest = req.body;

  const { title, content, description, tags, status } = body;

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

    // Check document exists and belongs to user's org
    const [existing] = await db
      .select()
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.id, documentId),
          eq(schema.documents.organizationId, user.organizationId)
        )
      )
      .limit(1);

    if (!existing) {
      res.status(404).json({
        error: "Not Found",
        message: "Document not found",
      });
      return;
    }

    // Build update object
    const updates: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (title !== undefined) updates.title = title;
    if (content !== undefined) updates.content = content;
    if (description !== undefined) updates.description = description;
    if (tags !== undefined) updates.tags = tags;
    if (status !== undefined) {
      updates.status = status;
      if (status === "published" && !existing.publishedAt) {
        updates.publishedAt = new Date();
      }
    }

    // Update document
    const [updated] = await db
      .update(schema.documents)
      .set(updates)
      .where(eq(schema.documents.id, documentId))
      .returning();

    // If content changed, create new version
    if (content !== undefined && content !== existing.content) {
      // Get latest version number
      const [latestVersion] = await db
        .select({ version: schema.documentVersions.version })
        .from(schema.documentVersions)
        .where(eq(schema.documentVersions.documentId, documentId))
        .orderBy(desc(schema.documentVersions.version))
        .limit(1);

      const newVersion = (latestVersion?.version || 0) + 1;

      await db.insert(schema.documentVersions).values({
        documentId,
        version: newVersion,
        content,
        changeType: "user_edit",
        changedBy: userId,
        changeSummary: "Manual edit",
      });
    }

    console.log(`[Documents] Document updated: ${documentId}`);

    res.json({
      success: true,
      document: updated,
    });
  } catch (error) {
    console.error("[Documents] Error updating document:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to update document",
    });
  }
});

/**
 * DELETE /api/documents/:id
 * Delete a document
 */
router.delete("/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const documentId = req.params.id;

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

    // Check document exists and belongs to user's org
    const [existing] = await db
      .select()
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.id, documentId),
          eq(schema.documents.organizationId, user.organizationId)
        )
      )
      .limit(1);

    if (!existing) {
      res.status(404).json({
        error: "Not Found",
        message: "Document not found",
      });
      return;
    }

    // Delete document (cascades to versions and contributions)
    await db.delete(schema.documents).where(eq(schema.documents.id, documentId));

    console.log(`[Documents] Document deleted: ${documentId}`);

    res.json({
      success: true,
      message: "Document deleted",
    });
  } catch (error) {
    console.error("[Documents] Error deleting document:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to delete document",
    });
  }
});

/**
 * GET /api/documents/:id/versions
 * Get version history for a document
 */
router.get("/:id/versions", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const documentId = req.params.id;

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

    // Verify document belongs to user's org
    const [document] = await db
      .select({ id: schema.documents.id })
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.id, documentId),
          eq(schema.documents.organizationId, user.organizationId)
        )
      )
      .limit(1);

    if (!document) {
      res.status(404).json({
        error: "Not Found",
        message: "Document not found",
      });
      return;
    }

    // Get versions with user info
    const versions = await db
      .select({
        id: schema.documentVersions.id,
        documentId: schema.documentVersions.documentId,
        version: schema.documentVersions.version,
        content: schema.documentVersions.content,
        changeSummary: schema.documentVersions.changeSummary,
        changedBy: schema.documentVersions.changedBy,
        changeType: schema.documentVersions.changeType,
        createdAt: schema.documentVersions.createdAt,
        userFirstName: schema.users.firstName,
        userLastName: schema.users.lastName,
      })
      .from(schema.documentVersions)
      .leftJoin(schema.users, eq(schema.documentVersions.changedBy, schema.users.id))
      .where(eq(schema.documentVersions.documentId, documentId))
      .orderBy(desc(schema.documentVersions.version));

    res.json({
      versions: versions.map((v) => ({
        id: v.id,
        documentId: v.documentId,
        version: v.version,
        content: v.content,
        changeSummary: v.changeSummary,
        changedBy: v.changedBy,
        changeType: v.changeType,
        createdAt: v.createdAt,
        changedByUser: v.userFirstName
          ? {
              id: v.changedBy,
              firstName: v.userFirstName,
              lastName: v.userLastName,
            }
          : undefined,
      })),
    });
  } catch (error) {
    console.error("[Documents] Error getting versions:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to get versions",
    });
  }
});

/**
 * POST /api/documents/:id/revise
 * AI-assisted content revision (similar to summary revise)
 */
router.post("/:id/revise", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const documentId = req.params.id;
  const { instruction, currentContent }: ReviseDocumentRequest = req.body;

  if (!instruction || !currentContent) {
    res.status(400).json({
      error: "Bad Request",
      message: "instruction and currentContent are required",
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

    // Verify document belongs to user's org
    const [document] = await db
      .select({ id: schema.documents.id, docType: schema.documents.docType })
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.id, documentId),
          eq(schema.documents.organizationId, user.organizationId)
        )
      )
      .limit(1);

    if (!document) {
      res.status(404).json({
        error: "Not Found",
        message: "Document not found",
      });
      return;
    }

    // Import doc generation service (lazy import to avoid circular deps)
    const { docGenerationService } = await import("../services/doc-generation.service.js");

    // Revise content using AI
    const suggestion = await docGenerationService.reviseContent(
      currentContent,
      instruction,
      document.docType as DocType
    );

    res.json({
      suggestion,
    });
  } catch (error) {
    console.error("[Documents] Error revising document:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to revise document",
    });
  }
});

/**
 * POST /api/documents/generate
 * Generate a new document from a monitoring session
 */
router.post("/generate", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const { sessionId, docType, title, additionalContext } = req.body;

  if (!sessionId || !docType) {
    res.status(400).json({
      error: "Bad Request",
      message: "sessionId and docType are required",
    });
    return;
  }

  // Validate docType
  const validDocTypes = ["how-to", "knowledge-article", "troubleshooting"];
  if (!validDocTypes.includes(docType)) {
    res.status(400).json({
      error: "Bad Request",
      message: `Invalid docType. Must be one of: ${validDocTypes.join(", ")}`,
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

    // Verify session belongs to user
    const [session] = await db
      .select()
      .from(schema.monitoringSessions)
      .where(
        and(
          eq(schema.monitoringSessions.id, sessionId),
          eq(schema.monitoringSessions.userId, userId)
        )
      )
      .limit(1);

    if (!session) {
      res.status(404).json({
        error: "Not Found",
        message: "Session not found",
      });
      return;
    }

    if (session.status !== "ready" && session.status !== "delivered") {
      res.status(400).json({
        error: "Bad Request",
        message: "Session must be completed (ready or delivered status) to generate documentation",
      });
      return;
    }

    // Import doc generation service
    const { docGenerationService } = await import("../services/doc-generation.service.js");

    // Generate document
    const result = await docGenerationService.generateFromSession({
      sessionId,
      docType,
      title,
      additionalContext,
      organizationId: user.organizationId,
      userId,
    });

    res.status(201).json(result);
  } catch (error) {
    console.error("[Documents] Error generating document:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to generate document",
    });
  }
});

/**
 * POST /api/documents/:id/enhance
 * Enhance an existing document with insights from a session
 */
router.post("/:id/enhance", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId!;
  const documentId = req.params.id;
  const { sessionId, enhancementType, userNotes } = req.body;

  if (!sessionId || !enhancementType) {
    res.status(400).json({
      error: "Bad Request",
      message: "sessionId and enhancementType are required",
    });
    return;
  }

  const validEnhancementTypes = ["append", "merge", "supplement"];
  if (!validEnhancementTypes.includes(enhancementType)) {
    res.status(400).json({
      error: "Bad Request",
      message: `Invalid enhancementType. Must be one of: ${validEnhancementTypes.join(", ")}`,
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

    // Verify document belongs to user's org
    const [document] = await db
      .select()
      .from(schema.documents)
      .where(
        and(
          eq(schema.documents.id, documentId),
          eq(schema.documents.organizationId, user.organizationId)
        )
      )
      .limit(1);

    if (!document) {
      res.status(404).json({
        error: "Not Found",
        message: "Document not found",
      });
      return;
    }

    // Verify session belongs to user
    const [session] = await db
      .select()
      .from(schema.monitoringSessions)
      .where(
        and(
          eq(schema.monitoringSessions.id, sessionId),
          eq(schema.monitoringSessions.userId, userId)
        )
      )
      .limit(1);

    if (!session) {
      res.status(404).json({
        error: "Not Found",
        message: "Session not found",
      });
      return;
    }

    // Import doc generation service
    const { docGenerationService } = await import("../services/doc-generation.service.js");

    // Enhance document
    const result = await docGenerationService.enhanceWithSession({
      documentId,
      sessionId,
      enhancementType,
      userNotes,
      userId,
    });

    res.json(result);
  } catch (error) {
    console.error("[Documents] Error enhancing document:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Failed to enhance document",
    });
  }
});

/**
 * POST /api/documents/:id/export/notion
 * Export document to Notion
 */
router.post(
  "/:id/export/notion",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const documentId = req.params.id;
    const { parentPageId } = req.body;

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

      // Verify document belongs to user's org
      const [document] = await db
        .select()
        .from(schema.documents)
        .where(
          and(
            eq(schema.documents.id, documentId),
            eq(schema.documents.organizationId, user.organizationId)
          )
        )
        .limit(1);

      if (!document) {
        res.status(404).json({
          error: "Not Found",
          message: "Document not found",
        });
        return;
      }

      // Import notion export service
      const { notionExportService } = await import("../services/notion-export.service.js");

      // Export to Notion using user's personal token
      const result = await notionExportService.exportDocument({
        documentId,
        userId,
        parentPageId,
      });

      res.json(result);
    } catch (error) {
      console.error("[Documents] Error exporting to Notion:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to export to Notion",
      });
    }
  }
);

/**
 * POST /api/documents/:id/export-google-docs
 * Export a document to Google Docs
 * Requires user to have connected Gmail/Google Workspace
 */
router.post(
  "/:id/export-google-docs",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const documentId = req.params.id;
    const { folderId } = req.body; // Optional Drive folder ID

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

      // Verify document belongs to user's org
      const [document] = await db
        .select()
        .from(schema.documents)
        .where(
          and(
            eq(schema.documents.id, documentId),
            eq(schema.documents.organizationId, user.organizationId)
          )
        )
        .limit(1);

      if (!document) {
        res.status(404).json({
          error: "Not Found",
          message: "Document not found",
        });
        return;
      }

      // Import Google Docs export service
      const { googleDocsExportService } = await import("../services/google-docs-export.service.js");

      // Export to Google Docs using user's Gmail tokens
      const result = await googleDocsExportService.exportDocument(documentId, userId, folderId);

      res.json(result);
    } catch (error) {
      console.error("[Documents] Error exporting to Google Docs:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to export to Google Docs",
      });
    }
  }
);

/**
 * GET /api/documents/google-drive-folders
 * List user's Google Drive folders for document export selection
 * Requires user to have connected Gmail/Google Workspace
 */
router.get(
  "/google-drive-folders",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;

    try {
      const { googleDocsExportService } = await import("../services/google-docs-export.service.js");

      const folders = await googleDocsExportService.listFolders(userId);
      res.json({ folders });
    } catch (error) {
      console.error("[Documents] Error listing Drive folders:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to list Google Drive folders",
      });
    }
  }
);

/**
 * DELETE /api/documents/:id/disconnect-google-docs
 * Disconnect Google Docs integration for a document
 */
router.delete(
  "/:id/disconnect-google-docs",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const documentId = req.params.id;

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

      // Verify document belongs to user's org
      const [document] = await db
        .select()
        .from(schema.documents)
        .where(
          and(
            eq(schema.documents.id, documentId),
            eq(schema.documents.organizationId, user.organizationId)
          )
        )
        .limit(1);

      if (!document) {
        res.status(404).json({
          error: "Not Found",
          message: "Document not found",
        });
        return;
      }

      const { googleDocsExportService } = await import("../services/google-docs-export.service.js");

      await googleDocsExportService.disconnectDocument(documentId);
      res.json({ success: true });
    } catch (error) {
      console.error("[Documents] Error disconnecting Google Docs:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "Failed to disconnect Google Docs",
      });
    }
  }
);

/**
 * POST /api/documents/ai-command
 * Handle AI commands from Plate editor (streaming response)
 * Supports: continue writing, improve, summarize, fix grammar, etc.
 */
router.post("/ai-command", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({
      error: "Bad Request",
      message: "messages array is required",
    });
    return;
  }

  try {
    // Set up streaming headers
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Cache-Control", "no-cache");

    // Get the last message content
    const lastMessage = messages[messages.length - 1];
    const userContent =
      lastMessage?.parts?.find((p: { type: string }) => p.type === "text")?.text ||
      lastMessage?.content ||
      "";

    // Determine the AI command type from the content
    let prompt = "";
    let systemPrompt = "";

    if (userContent.toLowerCase().includes("continue writing")) {
      systemPrompt =
        "You are a helpful writing assistant. Continue writing the document naturally, maintaining the same style and tone.";
      prompt = userContent;
    } else if (userContent.toLowerCase().includes("improve")) {
      systemPrompt =
        "You are an expert editor. Improve the writing quality while preserving the original meaning.";
      prompt = userContent;
    } else if (userContent.toLowerCase().includes("summarize")) {
      systemPrompt =
        "You are a concise summarizer. Create a clear, comprehensive summary of the content.";
      prompt = userContent;
    } else if (
      userContent.toLowerCase().includes("fix") ||
      userContent.toLowerCase().includes("grammar")
    ) {
      systemPrompt = "You are a grammar expert. Fix all spelling, grammar, and punctuation errors.";
      prompt = userContent;
    } else if (userContent.toLowerCase().includes("longer")) {
      systemPrompt =
        "You are a content expander. Expand the text with more detail while maintaining quality.";
      prompt = userContent;
    } else if (userContent.toLowerCase().includes("shorter")) {
      systemPrompt =
        "You are a content editor. Make the text more concise while keeping key information.";
      prompt = userContent;
    } else if (userContent.toLowerCase().includes("simplify")) {
      systemPrompt = "You are a clarity expert. Simplify the language for easier understanding.";
      prompt = userContent;
    } else {
      systemPrompt =
        "You are a helpful AI writing assistant for document editing. Help the user with their request.";
      prompt = userContent;
    }

    // Import Gemini service for AI generation
    const { GoogleGenerativeAI } = await import("@google/generative-ai");

    const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_AI_API_KEY or GEMINI_API_KEY not configured");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Generate streaming response
    const result = await model.generateContentStream({
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemPrompt}\n\n${prompt}` }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.7,
      },
    });

    // Generate message ID
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Send streaming start events
    res.write('data: {"type":"start"}\n\n');
    res.write('data: {"type":"start-step"}\n\n');
    res.write(`data: {"type":"text-start","id":"${messageId}"}\n\n`);

    // Stream the response
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        // Escape special characters for JSON
        const escapedText = text
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"')
          .replace(/\n/g, "\\n")
          .replace(/\r/g, "\\r")
          .replace(/\t/g, "\\t");

        res.write(`data: {"type":"text-delta","id":"${messageId}","delta":"${escapedText}"}\n\n`);
      }
    }

    // Send end events
    res.write(`data: {"type":"text-end","id":"${messageId}"}\n\n`);
    res.write('data: {"type":"finish-step"}\n\n');
    res.write('data: {"type":"finish"}\n\n');
    res.write("data: [DONE]\n\n");

    res.end();
  } catch (error) {
    console.error("[Documents] Error in AI command:", error);

    // If headers not sent yet, send error response
    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : "AI command failed",
      });
    } else {
      // If streaming already started, send error in stream format
      const errorMessage = error instanceof Error ? error.message : "AI command failed";
      res.write(`data: {"type":"error","message":"${errorMessage}"}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    }
  }
});

export default router;
