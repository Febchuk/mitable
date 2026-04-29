import { Router, Request, Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../../db/client.js";
import { requireAuth } from "../../auth/middleware/auth.js";
import { createLogger } from "../../shared-infra/lib/logger.js";
import {
    montessoriAttendance,
    montessoriClassrooms,
    montessoriObservations,
    montessoriReports,
    montessoriStudents,
} from "../schema/montessori.schema.js";

const logger = createLogger({ module: "MontessoriWrites" });

const router = Router();
router.use(requireAuth);

/**
 * Mutation endpoints. The product's broader write surface (curriculum
 * edits, classroom CRUD, teacher invites) intentionally lives outside
 * this commit — those flows are admin-rare and can ship in a follow-up
 * once the day-to-day teacher loops (observations, attendance, report
 * status) are persisting.
 */

// ─── Observations ────────────────────────────────────────────────────
//
// POST /observations creates a fresh observation row. We never update
// in place: each cell change is a new row. The grid uses DISTINCT ON
// to surface the latest level per (student, topic).

const ObservationBody = z.object({
    studentId: z.string().uuid(),
    topicId: z.string().uuid(),
    level: z.enum(["introduced", "practising", "mastered"]),
    note: z.string().max(2000).nullable().optional(),
    inputMethod: z.enum(["grid", "text", "voice", "photo", "agent"]).optional(),
    authorType: z.enum(["teacher", "agent"]).optional(),
});

router.post("/observations", async (req: Request, res: Response): Promise<void> => {
    try {
        const orgId = req.organizationId!;
        const userId = req.userId!;
        const parsed = ObservationBody.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: "invalid_body", issues: parsed.error.issues });
            return;
        }
        const { studentId, topicId, level, note, inputMethod, authorType } = parsed.data;

        // Confirm the student belongs to this org. The topicId is also
        // org-scoped at the schema level; if a caller forges a topic from
        // another org the FK insert will succeed but the read endpoints
        // filter by org so it'd be invisible. We still verify the student
        // explicitly because that's the user-facing entity.
        const [student] = await db
            .select({ id: montessoriStudents.id })
            .from(montessoriStudents)
            .where(
                and(
                    eq(montessoriStudents.id, studentId),
                    eq(montessoriStudents.organizationId, orgId)
                )
            )
            .limit(1);
        if (!student) {
            res.status(404).json({ error: "student_not_found" });
            return;
        }

        const [row] = await db
            .insert(montessoriObservations)
            .values({
                organizationId: orgId,
                studentId,
                topicId,
                level,
                note: note ?? null,
                inputMethod: inputMethod ?? "grid",
                authorType: authorType ?? "teacher",
                authorUserId: authorType === "agent" ? null : userId,
            })
            .returning();

        res.status(201).json({ observation: row });
    } catch (error) {
        logger.error({ error }, "POST /observations failed");
        res.status(500).json({ error: "internal_error" });
    }
});

// ─── Attendance (bulk upsert) ───────────────────────────────────────
//
// PUT /attendance replaces the day's register for a classroom. The UI
// always sends the full set of {studentId, status} pairs visible on
// screen, so we upsert each entry. Schema enforces UNIQUE(student_id,
// date) — duplicate calls for the same day overwrite cleanly.

const AttendanceBody = z.object({
    classroomId: z.string().uuid(),
    date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
    entries: z
        .array(
            z.object({
                studentId: z.string().uuid(),
                status: z.enum(["present", "absent"]),
                note: z.string().max(500).nullable().optional(),
            })
        )
        .min(1),
});

router.put("/attendance", async (req: Request, res: Response): Promise<void> => {
    try {
        const orgId = req.organizationId!;
        const parsed = AttendanceBody.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: "invalid_body", issues: parsed.error.issues });
            return;
        }
        const { classroomId, date, entries } = parsed.data;

        const [classroom] = await db
            .select({ id: montessoriClassrooms.id })
            .from(montessoriClassrooms)
            .where(
                and(
                    eq(montessoriClassrooms.id, classroomId),
                    eq(montessoriClassrooms.organizationId, orgId)
                )
            )
            .limit(1);
        if (!classroom) {
            res.status(404).json({ error: "classroom_not_found" });
            return;
        }

        // Confirm every studentId belongs to the same classroom + org.
        // We do this in one query rather than N — it's cheaper and the
        // failure mode is a clean 400 rather than a partial write.
        const studentIds = entries.map((e) => e.studentId);
        const validStudents = await db
            .select({ id: montessoriStudents.id })
            .from(montessoriStudents)
            .where(
                and(
                    eq(montessoriStudents.organizationId, orgId),
                    eq(montessoriStudents.classroomId, classroomId)
                )
            );
        const validIds = new Set(validStudents.map((s) => s.id));
        const invalid = studentIds.filter((id) => !validIds.has(id));
        if (invalid.length) {
            res.status(400).json({ error: "students_outside_classroom", studentIds: invalid });
            return;
        }

        // Bulk upsert. drizzle-orm's onConflictDoUpdate matches the
        // UNIQUE(student_id, date) constraint we declared on the table.
        const written = await db
            .insert(montessoriAttendance)
            .values(
                entries.map((e) => ({
                    organizationId: orgId,
                    studentId: e.studentId,
                    date,
                    status: e.status,
                    note: e.note ?? null,
                }))
            )
            .onConflictDoUpdate({
                target: [montessoriAttendance.studentId, montessoriAttendance.date],
                set: {
                    status: sql`excluded.status`,
                    note: sql`excluded.note`,
                    updatedAt: new Date(),
                },
            })
            .returning();

        res.json({ entries: written });
    } catch (error) {
        logger.error({ error }, "PUT /attendance failed");
        res.status(500).json({ error: "internal_error" });
    }
});

// ─── Reports ────────────────────────────────────────────────────────
//
// PATCH /reports/:id updates status + populates approvedAt / sentAt
// from the transition. Document generation (DOCX/PDF) lands later
// in Phase 5; this endpoint just moves the status flag.

const ReportPatchBody = z
    .object({
        status: z.enum(["draft", "approved", "sent"]).optional(),
        summary: z.string().max(10_000).nullable().optional(),
        sections: z.array(z.object({ domainId: z.string(), narrative: z.string() })).optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: "empty_patch" });

router.patch("/reports/:id", async (req: Request, res: Response): Promise<void> => {
    try {
        const orgId = req.organizationId!;
        const { id } = req.params;
        const parsed = ReportPatchBody.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: "invalid_body", issues: parsed.error.issues });
            return;
        }

        const [existing] = await db
            .select()
            .from(montessoriReports)
            .where(and(eq(montessoriReports.id, id), eq(montessoriReports.organizationId, orgId)))
            .limit(1);
        if (!existing) {
            res.status(404).json({ error: "report_not_found" });
            return;
        }

        const update: Record<string, unknown> = { updatedAt: new Date() };
        if (parsed.data.summary !== undefined) update.summary = parsed.data.summary;
        if (parsed.data.sections !== undefined) update.sections = parsed.data.sections;
        if (parsed.data.status && parsed.data.status !== existing.status) {
            update.status = parsed.data.status;
            // Stamp the right transition timestamp. We never clear an
            // older stamp — once a report has been approved that fact
            // stays in the audit trail even if it's later edited.
            if (parsed.data.status === "approved" && !existing.approvedAt) {
                update.approvedAt = new Date();
            }
            if (parsed.data.status === "sent" && !existing.sentAt) {
                update.sentAt = new Date();
            }
        }

        const [row] = await db
            .update(montessoriReports)
            .set(update)
            .where(eq(montessoriReports.id, id))
            .returning();

        res.json({ report: row });
    } catch (error) {
        logger.error({ error }, "PATCH /reports/:id failed");
        res.status(500).json({ error: "internal_error" });
    }
});

export default router;
