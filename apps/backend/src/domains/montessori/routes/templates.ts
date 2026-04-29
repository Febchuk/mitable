import { Router, type Request, type Response } from "express";
import multer from "multer";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../../db/client.js";
import { users } from "../../../db/schema/index.js";
import { requireAuth } from "../../auth/middleware/auth.js";
import { createLogger } from "../../shared-infra/lib/logger.js";
import { montessoriReportTemplates } from "../schema/montessori.schema.js";
import { parseTemplate } from "../services/template-parser.service.js";
import {
    createSignedUrl,
    deleteAtPath,
    templateSourcePath,
    uploadBytes,
} from "../services/template-storage.service.js";

const logger = createLogger({ module: "MontessoriTemplates" });

const router = Router();
router.use(requireAuth);

/**
 * Admin-only routes for managing report templates.
 *
 *   POST   /admin/templates       upload a new .docx or .pdf template
 *   GET    /admin/templates       list templates for the org
 *   GET    /admin/templates/:id   detail (incl. parsedStructure)
 *   GET    /admin/templates/:id/download  short-lived signed URL
 *   DELETE /admin/templates/:id   removes the row + the storage file
 *
 * Upload happens in memory and is streamed straight to Supabase
 * Storage. Bytes never touch the local disk.
 */

// ─── Admin guard ────────────────────────────────────────────────────

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
    const userId = req.userId!;
    const [user] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
    if (!user || user.role !== "admin") {
        res.status(403).json({ error: "admin_only" });
        return false;
    }
    return true;
}

// ─── Multer (in-memory, hard size cap) ──────────────────────────────

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        // 10 MB is more than enough for a Word/PDF report template
        // and keeps a malicious upload from holding meaningful RAM.
        fileSize: 10 * 1024 * 1024,
        files: 1,
    },
});

// ─── POST /admin/templates ──────────────────────────────────────────

const UploadFields = z.object({
    name: z.string().min(1).max(200),
});

router.post(
    "/admin/templates",
    upload.single("file"),
    async (req: Request, res: Response): Promise<void> => {
        try {
            if (!(await requireAdmin(req, res))) return;

            const orgId = req.organizationId!;
            const userId = req.userId!;

            const parsed = UploadFields.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ error: "invalid_body", issues: parsed.error.issues });
                return;
            }
            const { name } = parsed.data;

            const file = req.file;
            if (!file) {
                res.status(400).json({ error: "missing_file" });
                return;
            }
            const sourceFormat = formatFromFile(file);
            if (!sourceFormat) {
                res.status(400).json({ error: "unsupported_format" });
                return;
            }

            const structure = await parseTemplate({
                bytes: file.buffer,
                sourceFormat,
            });

            // Insert the row first so the Supabase Storage path can
            // include the row id. We rollback the row if the upload
            // fails — keeps the DB and bucket in sync.
            const [row] = await db
                .insert(montessoriReportTemplates)
                .values({
                    organizationId: orgId,
                    name,
                    originalFilename: file.originalname,
                    sourceFormat,
                    storagePath: "", // filled in on success
                    parsedStructure: structure as unknown as Record<string, unknown>,
                    uploadedByUserId: userId,
                })
                .returning();

            const path = templateSourcePath({
                organizationId: orgId,
                templateId: row!.id,
                sourceFormat,
            });

            try {
                await uploadBytes({
                    path,
                    bytes: file.buffer,
                    contentType: file.mimetype,
                });
            } catch (uploadError) {
                await db
                    .delete(montessoriReportTemplates)
                    .where(eq(montessoriReportTemplates.id, row!.id));
                throw uploadError;
            }

            await db
                .update(montessoriReportTemplates)
                .set({ storagePath: path, updatedAt: new Date() })
                .where(eq(montessoriReportTemplates.id, row!.id));

            res.status(201).json({
                template: {
                    id: row!.id,
                    name,
                    originalFilename: file.originalname,
                    sourceFormat,
                    parsedStructure: structure,
                },
            });
        } catch (error) {
            logger.error({ error }, "POST /admin/templates failed");
            res.status(500).json({ error: "internal_error" });
        }
    }
);

// ─── GET /admin/templates ───────────────────────────────────────────

router.get("/admin/templates", async (req: Request, res: Response): Promise<void> => {
    try {
        if (!(await requireAdmin(req, res))) return;
        const orgId = req.organizationId!;

        const rows = await db
            .select({
                id: montessoriReportTemplates.id,
                name: montessoriReportTemplates.name,
                originalFilename: montessoriReportTemplates.originalFilename,
                sourceFormat: montessoriReportTemplates.sourceFormat,
                createdAt: montessoriReportTemplates.createdAt,
                updatedAt: montessoriReportTemplates.updatedAt,
            })
            .from(montessoriReportTemplates)
            .where(eq(montessoriReportTemplates.organizationId, orgId))
            .orderBy(desc(montessoriReportTemplates.createdAt));

        res.json({ templates: rows });
    } catch (error) {
        logger.error({ error }, "GET /admin/templates failed");
        res.status(500).json({ error: "internal_error" });
    }
});

// ─── GET /admin/templates/:id ───────────────────────────────────────

router.get("/admin/templates/:id", async (req: Request, res: Response): Promise<void> => {
    try {
        if (!(await requireAdmin(req, res))) return;
        const orgId = req.organizationId!;
        const { id } = req.params;

        const [row] = await db
            .select()
            .from(montessoriReportTemplates)
            .where(
                and(
                    eq(montessoriReportTemplates.id, id),
                    eq(montessoriReportTemplates.organizationId, orgId)
                )
            )
            .limit(1);

        if (!row) {
            res.status(404).json({ error: "template_not_found" });
            return;
        }
        res.json({ template: row });
    } catch (error) {
        logger.error({ error }, "GET /admin/templates/:id failed");
        res.status(500).json({ error: "internal_error" });
    }
});

// ─── GET /admin/templates/:id/download ──────────────────────────────

router.get(
    "/admin/templates/:id/download",
    async (req: Request, res: Response): Promise<void> => {
        try {
            if (!(await requireAdmin(req, res))) return;
            const orgId = req.organizationId!;
            const { id } = req.params;

            const [row] = await db
                .select({ storagePath: montessoriReportTemplates.storagePath })
                .from(montessoriReportTemplates)
                .where(
                    and(
                        eq(montessoriReportTemplates.id, id),
                        eq(montessoriReportTemplates.organizationId, orgId)
                    )
                )
                .limit(1);

            if (!row || !row.storagePath) {
                res.status(404).json({ error: "template_not_found" });
                return;
            }

            const url = await createSignedUrl({
                path: row.storagePath,
                expiresInSeconds: 60,
            });
            res.json({ url });
        } catch (error) {
            logger.error({ error }, "GET /admin/templates/:id/download failed");
            res.status(500).json({ error: "internal_error" });
        }
    }
);

// ─── DELETE /admin/templates/:id ────────────────────────────────────

router.delete(
    "/admin/templates/:id",
    async (req: Request, res: Response): Promise<void> => {
        try {
            if (!(await requireAdmin(req, res))) return;
            const orgId = req.organizationId!;
            const { id } = req.params;

            const [row] = await db
                .select({ storagePath: montessoriReportTemplates.storagePath })
                .from(montessoriReportTemplates)
                .where(
                    and(
                        eq(montessoriReportTemplates.id, id),
                        eq(montessoriReportTemplates.organizationId, orgId)
                    )
                )
                .limit(1);

            if (!row) {
                res.status(404).json({ error: "template_not_found" });
                return;
            }

            // Delete the row first; storage cleanup is best-effort.
            await db
                .delete(montessoriReportTemplates)
                .where(eq(montessoriReportTemplates.id, id));

            if (row.storagePath) {
                await deleteAtPath(row.storagePath);
            }

            res.status(204).send();
        } catch (error) {
            logger.error({ error }, "DELETE /admin/templates/:id failed");
            res.status(500).json({ error: "internal_error" });
        }
    }
);

// ─── Helpers ────────────────────────────────────────────────────────

function formatFromFile(file: Express.Multer.File): "docx" | "pdf" | null {
    const name = file.originalname.toLowerCase();
    const mime = (file.mimetype ?? "").toLowerCase();
    if (
        name.endsWith(".docx") ||
        mime ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
        return "docx";
    }
    if (name.endsWith(".pdf") || mime === "application/pdf") {
        return "pdf";
    }
    return null;
}

export default router;
