import { Router, Request, Response } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "../../../db/client.js";
import { users } from "../../../db/schema/index.js";
import { requireAuth } from "../../auth/middleware/auth.js";
import { createLogger } from "../../shared-infra/lib/logger.js";
import {
  montessoriAgentMessages,
  montessoriAgentThreads,
  montessoriAttendance,
  montessoriClassrooms,
  montessoriDomains,
  montessoriObservations,
  montessoriReports,
  montessoriStudents,
  montessoriTopics,
} from "../schema/montessori.schema.js";

const logger = createLogger({ module: "MontessoriReads" });

const router = Router();
router.use(requireAuth);

/**
 * Read endpoints for the Montessori product. Every handler is org-scoped
 * via req.organizationId — there is no surface here for reading data
 * outside the user's school. Cross-classroom access within the school is
 * allowed (admins routinely span classrooms; teachers occasionally view
 * other rooms' grids during planning).
 */

// ─── Classrooms / teachers ───────────────────────────────────────────

router.get("/classrooms", async (req: Request, res: Response): Promise<void> => {
  try {
    const orgId = req.organizationId!;
    const rows = await db
      .select({
        id: montessoriClassrooms.id,
        name: montessoriClassrooms.name,
        level: montessoriClassrooms.level,
        ageRange: montessoriClassrooms.ageRange,
        teacherId: montessoriClassrooms.teacherId,
      })
      .from(montessoriClassrooms)
      .where(eq(montessoriClassrooms.organizationId, orgId))
      .orderBy(asc(montessoriClassrooms.name));
    res.json({ classrooms: rows });
  } catch (error) {
    logger.error({ error }, "GET /classrooms failed");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/classrooms/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const orgId = req.organizationId!;
    const { id } = req.params;
    const [row] = await db
      .select()
      .from(montessoriClassrooms)
      .where(and(eq(montessoriClassrooms.id, id), eq(montessoriClassrooms.organizationId, orgId)))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "classroom_not_found" });
      return;
    }
    res.json({ classroom: row });
  } catch (error) {
    logger.error({ error }, "GET /classrooms/:id failed");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/teachers", async (req: Request, res: Response): Promise<void> => {
  try {
    const orgId = req.organizationId!;
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
      })
      .from(users)
      .where(eq(users.organizationId, orgId))
      .orderBy(asc(users.firstName), asc(users.lastName));
    res.json({ teachers: rows });
  } catch (error) {
    logger.error({ error }, "GET /teachers failed");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── Students ────────────────────────────────────────────────────────

router.get("/students", async (req: Request, res: Response): Promise<void> => {
  try {
    const orgId = req.organizationId!;
    const classroomId = (req.query.classroomId as string | undefined) ?? null;
    const where = classroomId
      ? and(
          eq(montessoriStudents.organizationId, orgId),
          eq(montessoriStudents.classroomId, classroomId)
        )
      : eq(montessoriStudents.organizationId, orgId);
    const rows = await db
      .select({
        id: montessoriStudents.id,
        name: montessoriStudents.name,
        age: montessoriStudents.age,
        classroomId: montessoriStudents.classroomId,
      })
      .from(montessoriStudents)
      .where(where)
      .orderBy(asc(montessoriStudents.name));
    res.json({ students: rows });
  } catch (error) {
    logger.error({ error }, "GET /students failed");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/students/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const orgId = req.organizationId!;
    const { id } = req.params;
    const [row] = await db
      .select({
        id: montessoriStudents.id,
        name: montessoriStudents.name,
        age: montessoriStudents.age,
        classroomId: montessoriStudents.classroomId,
      })
      .from(montessoriStudents)
      .where(and(eq(montessoriStudents.id, id), eq(montessoriStudents.organizationId, orgId)))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "student_not_found" });
      return;
    }
    res.json({ student: row });
  } catch (error) {
    logger.error({ error }, "GET /students/:id failed");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/students/:id/observations", async (req: Request, res: Response): Promise<void> => {
  try {
    const orgId = req.organizationId!;
    const { id } = req.params;
    const rows = await db
      .select({
        id: montessoriObservations.id,
        studentId: montessoriObservations.studentId,
        topicId: montessoriObservations.topicId,
        level: montessoriObservations.level,
        note: montessoriObservations.note,
        summary: montessoriObservations.summary,
        inputMethod: montessoriObservations.inputMethod,
        authorType: montessoriObservations.authorType,
        createdAt: montessoriObservations.createdAt,
      })
      .from(montessoriObservations)
      .where(
        and(
          eq(montessoriObservations.studentId, id),
          eq(montessoriObservations.organizationId, orgId)
        )
      )
      .orderBy(desc(montessoriObservations.createdAt));
    res.json({ observations: rows });
  } catch (error) {
    logger.error({ error }, "GET /students/:id/observations failed");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/students/:id/attendance", async (req: Request, res: Response): Promise<void> => {
  try {
    const orgId = req.organizationId!;
    const { id } = req.params;
    const rows = await db
      .select({
        id: montessoriAttendance.id,
        studentId: montessoriAttendance.studentId,
        date: montessoriAttendance.date,
        status: montessoriAttendance.status,
        note: montessoriAttendance.note,
      })
      .from(montessoriAttendance)
      .where(
        and(eq(montessoriAttendance.studentId, id), eq(montessoriAttendance.organizationId, orgId))
      )
      .orderBy(desc(montessoriAttendance.date));
    res.json({ attendance: rows });
  } catch (error) {
    logger.error({ error }, "GET /students/:id/attendance failed");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── Curriculum (domains + topics) ───────────────────────────────────

router.get("/curriculum", async (req: Request, res: Response): Promise<void> => {
  try {
    const orgId = req.organizationId!;
    const [domains, topics] = await Promise.all([
      db
        .select({
          id: montessoriDomains.id,
          name: montessoriDomains.name,
          level: montessoriDomains.level,
          colorHue: montessoriDomains.colorHue,
          active: montessoriDomains.active,
          sortOrder: montessoriDomains.sortOrder,
        })
        .from(montessoriDomains)
        .where(eq(montessoriDomains.organizationId, orgId))
        .orderBy(asc(montessoriDomains.sortOrder), asc(montessoriDomains.name)),
      db
        .select({
          id: montessoriTopics.id,
          domainId: montessoriTopics.domainId,
          name: montessoriTopics.name,
          level: montessoriTopics.level,
          active: montessoriTopics.active,
          sortOrder: montessoriTopics.sortOrder,
        })
        .from(montessoriTopics)
        .where(eq(montessoriTopics.organizationId, orgId))
        .orderBy(asc(montessoriTopics.sortOrder), asc(montessoriTopics.name)),
    ]);
    res.json({ domains, topics });
  } catch (error) {
    logger.error({ error }, "GET /curriculum failed");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── Grid snapshot ───────────────────────────────────────────────────
//
// Bulk read powering the classroom grid. One round-trip returns the
// classroom, students, level-relevant active topics + their domains,
// and the latest observation per (student, topic). The "latest" cut
// uses Postgres DISTINCT ON since drizzle-orm has no native sugar for
// it and the alternative (window function in TS) is uglier.

router.get("/grid", async (req: Request, res: Response): Promise<void> => {
  try {
    const orgId = req.organizationId!;
    const classroomId = req.query.classroomId as string | undefined;
    if (!classroomId) {
      res.status(400).json({ error: "classroomId_required" });
      return;
    }

    const [classroom] = await db
      .select({
        id: montessoriClassrooms.id,
        name: montessoriClassrooms.name,
        level: montessoriClassrooms.level,
        ageRange: montessoriClassrooms.ageRange,
      })
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

    const level = classroom.level;
    const levelFilter = sql`(${montessoriTopics.level} = ${level} OR ${montessoriTopics.level} = 'both')`;
    const domainsLevelFilter = sql`(${montessoriDomains.level} = ${level} OR ${montessoriDomains.level} = 'both')`;

    const [students, domains, topics, observationRows] = await Promise.all([
      db
        .select({
          id: montessoriStudents.id,
          name: montessoriStudents.name,
          age: montessoriStudents.age,
        })
        .from(montessoriStudents)
        .where(
          and(
            eq(montessoriStudents.organizationId, orgId),
            eq(montessoriStudents.classroomId, classroomId)
          )
        )
        .orderBy(asc(montessoriStudents.name)),
      db
        .select({
          id: montessoriDomains.id,
          name: montessoriDomains.name,
          level: montessoriDomains.level,
          colorHue: montessoriDomains.colorHue,
          sortOrder: montessoriDomains.sortOrder,
          active: montessoriDomains.active,
        })
        .from(montessoriDomains)
        .where(
          and(
            eq(montessoriDomains.organizationId, orgId),
            eq(montessoriDomains.active, true),
            domainsLevelFilter
          )
        )
        .orderBy(asc(montessoriDomains.sortOrder), asc(montessoriDomains.name)),
      db
        .select({
          id: montessoriTopics.id,
          domainId: montessoriTopics.domainId,
          name: montessoriTopics.name,
          level: montessoriTopics.level,
          sortOrder: montessoriTopics.sortOrder,
          active: montessoriTopics.active,
        })
        .from(montessoriTopics)
        .where(
          and(
            eq(montessoriTopics.organizationId, orgId),
            eq(montessoriTopics.active, true),
            levelFilter
          )
        )
        .orderBy(asc(montessoriTopics.sortOrder), asc(montessoriTopics.name)),
      db.execute<{
        id: string;
        student_id: string;
        topic_id: string;
        level: string;
        note: string | null;
        created_at: Date;
        input_method: string;
        author_type: string;
      }>(sql`
                SELECT DISTINCT ON (o.student_id, o.topic_id)
                    o.id, o.student_id, o.topic_id, o.level, o.note,
                    o.created_at, o.input_method, o.author_type
                FROM montessori_observations o
                JOIN montessori_students s ON s.id = o.student_id
                WHERE o.organization_id = ${orgId}
                  AND s.classroom_id = ${classroomId}
                ORDER BY o.student_id, o.topic_id, o.created_at DESC
            `),
    ]);

    const observations = observationRows.rows.map((r) => ({
      id: r.id,
      studentId: r.student_id,
      topicId: r.topic_id,
      level: r.level,
      note: r.note,
      createdAt: r.created_at,
      inputMethod: r.input_method,
      authorType: r.author_type,
    }));

    res.json({ classroom, students, domains, topics, observations });
  } catch (error) {
    logger.error({ error }, "GET /grid failed");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── Attendance (daily) ──────────────────────────────────────────────

router.get("/attendance", async (req: Request, res: Response): Promise<void> => {
  try {
    const orgId = req.organizationId!;
    const classroomId = req.query.classroomId as string | undefined;
    const date = req.query.date as string | undefined;
    if (!classroomId || !date) {
      res.status(400).json({ error: "classroomId_and_date_required" });
      return;
    }

    // Pull all students in the classroom + the day's recorded entries.
    // The client merges them so missing students render as "not recorded".
    const [students, entries] = await Promise.all([
      db
        .select({
          id: montessoriStudents.id,
          name: montessoriStudents.name,
        })
        .from(montessoriStudents)
        .where(
          and(
            eq(montessoriStudents.organizationId, orgId),
            eq(montessoriStudents.classroomId, classroomId)
          )
        )
        .orderBy(asc(montessoriStudents.name)),
      db
        .select({
          id: montessoriAttendance.id,
          studentId: montessoriAttendance.studentId,
          date: montessoriAttendance.date,
          status: montessoriAttendance.status,
          note: montessoriAttendance.note,
        })
        .from(montessoriAttendance)
        .where(
          and(eq(montessoriAttendance.organizationId, orgId), eq(montessoriAttendance.date, date))
        ),
    ]);

    res.json({ classroomId, date, students, entries });
  } catch (error) {
    logger.error({ error }, "GET /attendance failed");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── Reports ─────────────────────────────────────────────────────────

router.get("/reports", async (req: Request, res: Response): Promise<void> => {
  try {
    const orgId = req.organizationId!;
    const classroomId = req.query.classroomId as string | undefined;
    const where = classroomId
      ? and(
          eq(montessoriReports.organizationId, orgId),
          eq(montessoriReports.classroomId, classroomId)
        )
      : eq(montessoriReports.organizationId, orgId);
    const rows = await db
      .select({
        id: montessoriReports.id,
        studentId: montessoriReports.studentId,
        classroomId: montessoriReports.classroomId,
        templateId: montessoriReports.templateId,
        type: montessoriReports.type,
        status: montessoriReports.status,
        summary: montessoriReports.summary,
        createdAt: montessoriReports.createdAt,
        approvedAt: montessoriReports.approvedAt,
        sentAt: montessoriReports.sentAt,
      })
      .from(montessoriReports)
      .where(where)
      .orderBy(desc(montessoriReports.createdAt));
    res.json({ reports: rows });
  } catch (error) {
    logger.error({ error }, "GET /reports failed");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/reports/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const orgId = req.organizationId!;
    const { id } = req.params;
    const [row] = await db
      .select()
      .from(montessoriReports)
      .where(and(eq(montessoriReports.id, id), eq(montessoriReports.organizationId, orgId)))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "report_not_found" });
      return;
    }
    res.json({ report: row });
  } catch (error) {
    logger.error({ error }, "GET /reports/:id failed");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── Agent threads + messages ────────────────────────────────────────

router.get("/agent/threads", async (req: Request, res: Response): Promise<void> => {
  try {
    const orgId = req.organizationId!;
    const userId = req.userId!;
    const rows = await db
      .select({
        id: montessoriAgentThreads.id,
        title: montessoriAgentThreads.title,
        roleAtCreation: montessoriAgentThreads.roleAtCreation,
        createdAt: montessoriAgentThreads.createdAt,
        updatedAt: montessoriAgentThreads.updatedAt,
      })
      .from(montessoriAgentThreads)
      .where(
        and(
          eq(montessoriAgentThreads.organizationId, orgId),
          eq(montessoriAgentThreads.userId, userId)
        )
      )
      .orderBy(desc(montessoriAgentThreads.updatedAt));
    res.json({ threads: rows });
  } catch (error) {
    logger.error({ error }, "GET /agent/threads failed");
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/agent/threads/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const orgId = req.organizationId!;
    const userId = req.userId!;
    const { id } = req.params;
    const [thread] = await db
      .select()
      .from(montessoriAgentThreads)
      .where(
        and(
          eq(montessoriAgentThreads.id, id),
          eq(montessoriAgentThreads.organizationId, orgId),
          eq(montessoriAgentThreads.userId, userId)
        )
      )
      .limit(1);
    if (!thread) {
      res.status(404).json({ error: "thread_not_found" });
      return;
    }
    const messages = await db
      .select({
        id: montessoriAgentMessages.id,
        role: montessoriAgentMessages.role,
        text: montessoriAgentMessages.text,
        card: montessoriAgentMessages.card,
        inputMethod: montessoriAgentMessages.inputMethod,
        attachmentMeta: montessoriAgentMessages.attachmentMeta,
        createdAt: montessoriAgentMessages.createdAt,
      })
      .from(montessoriAgentMessages)
      .where(eq(montessoriAgentMessages.threadId, id))
      .orderBy(asc(montessoriAgentMessages.createdAt));
    res.json({ thread, messages });
  } catch (error) {
    logger.error({ error }, "GET /agent/threads/:id failed");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
