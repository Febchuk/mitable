import { Router, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../../db/client.js";
import { users } from "../../../db/schema/index.js";
import { organizations } from "../../auth/schema/organizations.schema.js";
import { requireAuth } from "../../auth/middleware/auth.js";
import { createLogger } from "../../shared-infra/lib/logger.js";
import {
    montessoriClassrooms,
    montessoriDomains,
    montessoriReports,
    montessoriReportTemplates,
    montessoriStudents,
} from "../schema/montessori.schema.js";
import {
    generateReportArtefacts,
    type ReportContext,
} from "../services/report-generator.service.js";
import { createSignedUrl } from "../services/template-storage.service.js";

const logger = createLogger({ module: "MontessoriReportArtefacts" });

const router = Router();
router.use(requireAuth);

/**
 * Generate + download endpoints for filled report artefacts.
 *
 *   POST /reports/:id/generate     produce DOCX (if a docx template
 *                                  is assigned) + PDF, persist paths
 *   GET  /reports/:id/download     short-lived signed URL for either
 *                                  the docx or pdf artefact
 *
 * Both endpoints check that the report belongs to the authed user's
 * organization. We don't yet partition by teacher/admin — any user
 * in the org can pull any of their org's reports — that's
 * deliberately scoped to a follow-up alongside the broader role
 * enforcement work.
 */

// ─── POST /reports/:id/generate ─────────────────────────────────────

const GenerateBody = z
    .object({
        /** Optional template override. If omitted we use whatever the
         *  report row has assigned (`templateId`). */
        templateId: z.string().uuid().optional(),
    })
    .optional();

router.post(
    "/reports/:id/generate",
    async (req: Request, res: Response): Promise<void> => {
        try {
            const orgId = req.organizationId!;
            const { id } = req.params;
            const parsed = GenerateBody.safeParse(req.body ?? {});
            if (!parsed.success) {
                res.status(400).json({ error: "invalid_body", issues: parsed.error.issues });
                return;
            }
            const explicitTemplateId = parsed.data?.templateId;

            const [report] = await db
                .select()
                .from(montessoriReports)
                .where(
                    and(
                        eq(montessoriReports.id, id),
                        eq(montessoriReports.organizationId, orgId)
                    )
                )
                .limit(1);
            if (!report) {
                res.status(404).json({ error: "report_not_found" });
                return;
            }

            // Resolve template: explicit override > report row's
            // templateId > none (PDF-only output).
            const templateId = explicitTemplateId ?? report.templateId ?? null;
            const template = templateId
                ? (
                      await db
                          .select({
                              id: montessoriReportTemplates.id,
                              storagePath: montessoriReportTemplates.storagePath,
                              sourceFormat: montessoriReportTemplates.sourceFormat,
                          })
                          .from(montessoriReportTemplates)
                          .where(
                              and(
                                  eq(montessoriReportTemplates.id, templateId),
                                  eq(montessoriReportTemplates.organizationId, orgId)
                              )
                          )
                          .limit(1)
                  )[0] ?? null
                : null;

            const [student] = await db
                .select({
                    id: montessoriStudents.id,
                    name: montessoriStudents.name,
                })
                .from(montessoriStudents)
                .where(eq(montessoriStudents.id, report.studentId))
                .limit(1);
            const [classroom] = await db
                .select({
                    id: montessoriClassrooms.id,
                    name: montessoriClassrooms.name,
                    teacherId: montessoriClassrooms.teacherId,
                })
                .from(montessoriClassrooms)
                .where(eq(montessoriClassrooms.id, report.classroomId))
                .limit(1);
            if (!student || !classroom) {
                res.status(404).json({ error: "report_student_or_classroom_missing" });
                return;
            }

            const [organization] = await db
                .select({ name: organizations.name })
                .from(organizations)
                .where(eq(organizations.id, orgId))
                .limit(1);

            // Teacher name is best-effort; null is fine.
            let teacherName: string | null = null;
            if (classroom.teacherId) {
                const [teacher] = await db
                    .select({ firstName: users.firstName, lastName: users.lastName })
                    .from(users)
                    .where(eq(users.id, classroom.teacherId))
                    .limit(1);
                if (teacher) {
                    teacherName = [teacher.firstName, teacher.lastName]
                        .filter((s) => s && s.trim().length > 0)
                        .join(" ")
                        .trim() || null;
                }
            }

            // Hydrate domain names for each section so the generator
            // doesn't have to re-query.
            const sectionsRaw = (report.sections ?? []) as Array<{
                domainId: string;
                narrative: string;
            }>;
            const domainIds = Array.from(new Set(sectionsRaw.map((s) => s.domainId)));
            const domainRows = domainIds.length
                ? await db
                      .select({ id: montessoriDomains.id, name: montessoriDomains.name })
                      .from(montessoriDomains)
                      .where(eq(montessoriDomains.organizationId, orgId))
                : [];
            const domainNameById = new Map(domainRows.map((d) => [d.id, d.name]));

            const context: ReportContext = {
                studentName: student.name,
                classroomName: classroom.name,
                schoolName: organization?.name ?? "",
                teacherName,
                date: new Date().toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                }),
                reportType: report.type === "end-of-term" ? "End-of-term report" : "Activity update",
                summary: report.summary ?? "",
                sections: sectionsRaw.map((s) => ({
                    domainName: domainNameById.get(s.domainId) ?? "Section",
                    narrative: s.narrative,
                })),
            };

            const result = await generateReportArtefacts({
                reportId: report.id,
                organizationId: orgId,
                context,
                templateStoragePath: template?.storagePath ?? null,
                templateFormat:
                    (template?.sourceFormat as "docx" | "pdf" | undefined) ?? null,
            });

            const [updated] = await db
                .update(montessoriReports)
                .set({
                    generatedDocxPath: result.docxPath,
                    generatedPdfPath: result.pdfPath,
                    templateId: template?.id ?? report.templateId ?? null,
                })
                .where(eq(montessoriReports.id, report.id))
                .returning({
                    id: montessoriReports.id,
                    generatedDocxPath: montessoriReports.generatedDocxPath,
                    generatedPdfPath: montessoriReports.generatedPdfPath,
                });

            res.json({
                report: updated,
                hasDocx: result.docxPath !== null,
            });
        } catch (error) {
            logger.error({ error }, "POST /reports/:id/generate failed");
            res.status(500).json({ error: "internal_error" });
        }
    }
);

// ─── GET /reports/:id/download ──────────────────────────────────────

router.get(
    "/reports/:id/download",
    async (req: Request, res: Response): Promise<void> => {
        try {
            const orgId = req.organizationId!;
            const { id } = req.params;
            const formatRaw = req.query.format;
            const format = formatRaw === "pdf" || formatRaw === "docx" ? formatRaw : "pdf";

            const [report] = await db
                .select({
                    docx: montessoriReports.generatedDocxPath,
                    pdf: montessoriReports.generatedPdfPath,
                })
                .from(montessoriReports)
                .where(
                    and(
                        eq(montessoriReports.id, id),
                        eq(montessoriReports.organizationId, orgId)
                    )
                )
                .limit(1);
            if (!report) {
                res.status(404).json({ error: "report_not_found" });
                return;
            }
            const path = format === "pdf" ? report.pdf : report.docx;
            if (!path) {
                res.status(404).json({
                    error: "artefact_not_ready",
                    message:
                        format === "docx"
                            ? "This report has no DOCX artefact. Generate it from a .docx template."
                            : "This report hasn't been generated yet. Call /generate first.",
                });
                return;
            }

            const url = await createSignedUrl({
                path,
                expiresInSeconds: 60,
            });
            res.json({ url, format });
        } catch (error) {
            logger.error({ error }, "GET /reports/:id/download failed");
            res.status(500).json({ error: "internal_error" });
        }
    }
);

export default router;
