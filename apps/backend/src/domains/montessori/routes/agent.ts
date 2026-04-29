import { Router, type Request, type Response } from "express";
import multer from "multer";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../../db/client.js";
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
import { montessoriInterpretationService } from "../services/montessori-interpretation.service.js";
import type { InterpretationTopic } from "../services/montessori-interpretation.service.js";
import { ProposedUpdatesEnvelopeSchema } from "../types/proposed-updates.js";

const logger = createLogger({ module: "MontessoriAgent" });

const router = Router();
router.use(requireAuth);

/**
 * /agent endpoints — the draft-and-confirm loop.
 *
 *   POST /agent/interpret   capture (text +/- photo +/- audio) → ProposedUpdates
 *   POST /agent/confirm     ProposedUpdates → DB writes in one txn
 *
 * Privacy: photo + audio bytes flow through this route in memory only.
 * multer is configured with memoryStorage and a hard 25 MB cap. We
 * never write the bytes to disk and never persist them to the DB —
 * only lightweight metadata (kind, sizeBytes) lands in
 * montessori_agent_messages.attachment_meta. The buffer references
 * are explicitly nulled in a finally so they're GC'd as soon as the
 * Gemini call returns.
 */

// ─── Multer (in-memory, hard size cap) ───────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    // 25 MB per file is enough for a multi-minute voice memo or a
    // high-res whiteboard photo, and small enough that we'll never
    // hold a meaningful amount of teacher-supplied media in RAM.
    fileSize: 25 * 1024 * 1024,
    // Two files max: at most one photo + at most one audio per
    // capture. Anything more is misuse.
    files: 2,
  },
});

// ─── POST /agent/interpret ───────────────────────────────────────────

const InterpretFields = z.object({
  /** Optional thread to append to. If absent we create a new thread. */
  threadId: z.string().uuid().optional(),
  /** Free-form text the teacher typed. May be empty when only media
   *  is attached. */
  text: z.string().max(4000).optional(),
});

router.post(
  "/agent/interpret",
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "audio", maxCount: 1 },
  ]),
  async (req: Request, res: Response): Promise<void> => {
    const orgId = req.organizationId!;
    const userId = req.userId!;

    const parsed = InterpretFields.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body", issues: parsed.error.issues });
      return;
    }
    const { threadId: incomingThreadId, text } = parsed.data;

    // multer surfaces files keyed by field name when fields() is
    // used. .single() would be neater but doesn't support two
    // distinct field names in one shot.
    const files = req.files as
      | { photo?: Express.Multer.File[]; audio?: Express.Multer.File[] }
      | undefined;
    let photoBuffer: Buffer | null = files?.photo?.[0]?.buffer ?? null;
    let audioBuffer: Buffer | null = files?.audio?.[0]?.buffer ?? null;
    const photoMime = files?.photo?.[0]?.mimetype ?? null;
    const audioMime = files?.audio?.[0]?.mimetype ?? null;

    // Reject empty captures up front — saves a Gemini call.
    if (!text && !photoBuffer && !audioBuffer) {
      res.status(400).json({ error: "empty_capture" });
      return;
    }

    try {
      // Resolve the teacher's classroom + curriculum context.
      // Teachers are mapped to a single classroom; the AI loop
      // doesn't run for unassigned admins (clarifying question is
      // a future flow).
      const [classroom] = await db
        .select({
          id: montessoriClassrooms.id,
          name: montessoriClassrooms.name,
          level: montessoriClassrooms.level,
        })
        .from(montessoriClassrooms)
        .where(
          and(
            eq(montessoriClassrooms.teacherId, userId),
            eq(montessoriClassrooms.organizationId, orgId)
          )
        )
        .limit(1);

      if (!classroom) {
        res.status(400).json({ error: "no_assigned_classroom" });
        return;
      }

      const [students, domains, topics] = await Promise.all([
        db
          .select({ id: montessoriStudents.id, name: montessoriStudents.name })
          .from(montessoriStudents)
          .where(eq(montessoriStudents.classroomId, classroom.id)),
        db
          .select({ id: montessoriDomains.id, name: montessoriDomains.name })
          .from(montessoriDomains)
          .where(
            and(eq(montessoriDomains.organizationId, orgId), eq(montessoriDomains.active, true))
          ),
        db
          .select({
            id: montessoriTopics.id,
            name: montessoriTopics.name,
            domainId: montessoriTopics.domainId,
            level: montessoriTopics.level,
          })
          .from(montessoriTopics)
          .where(
            and(eq(montessoriTopics.organizationId, orgId), eq(montessoriTopics.active, true))
          ),
      ]);

      const domainNameById = new Map(domains.map((d) => [d.id, d.name]));
      const interpretationTopics: InterpretationTopic[] = topics.map((t) => ({
        id: t.id,
        name: t.name,
        domainId: t.domainId,
        domainName: domainNameById.get(t.domainId) ?? "",
        level: (t.level as InterpretationTopic["level"]) ?? "both",
      }));

      // Pull observations for this classroom so the agent can reason
      // about reports / progress. We use DISTINCT ON (student, topic)
      // so each cell contributes its latest level.
      const studentIds = students.map((s) => s.id);
      const topicNameById = new Map(topics.map((t) => [t.id, t.name]));
      const studentNameById = new Map(students.map((s) => [s.id, s.name]));
      const topicDomainIdById = new Map(topics.map((t) => [t.id, t.domainId]));
      const observationRowsResult =
        studentIds.length === 0
          ? {
              rows: [] as Array<{
                student_id: string;
                topic_id: string;
                level: string;
                note: string | null;
                created_at: Date;
              }>,
            }
          : await db.execute<{
              student_id: string;
              topic_id: string;
              level: string;
              note: string | null;
              created_at: Date;
            }>(sql`
                    SELECT DISTINCT ON (o.student_id, o.topic_id)
                        o.student_id, o.topic_id, o.level, o.note, o.created_at
                    FROM montessori_observations o
                    WHERE o.organization_id = ${orgId}
                      AND o.student_id IN (${sql.join(
                        studentIds.map((id) => sql`${id}`),
                        sql`, `
                      )})
                    ORDER BY o.student_id, o.topic_id, o.created_at DESC
                `);
      const interpretationObservations = observationRowsResult.rows
        .map((r) => ({
          studentName: studentNameById.get(r.student_id) ?? "",
          topicName: topicNameById.get(r.topic_id) ?? "",
          domainName: domainNameById.get(topicDomainIdById.get(r.topic_id) ?? "") ?? "",
          level: r.level as "introduced" | "practising" | "mastered",
          note: r.note,
          createdAt: new Date(r.created_at).toISOString(),
        }))
        .filter((o) => o.studentName && o.topicName);

      // Ensure or create the thread before we call Gemini, so the
      // user's message is persisted even if the call fails.
      let threadId = incomingThreadId ?? null;
      if (threadId) {
        const [existing] = await db
          .select({ id: montessoriAgentThreads.id })
          .from(montessoriAgentThreads)
          .where(
            and(
              eq(montessoriAgentThreads.id, threadId),
              eq(montessoriAgentThreads.organizationId, orgId),
              eq(montessoriAgentThreads.userId, userId)
            )
          )
          .limit(1);
        if (!existing) {
          res.status(404).json({ error: "thread_not_found" });
          return;
        }
      } else {
        const [created] = await db
          .insert(montessoriAgentThreads)
          .values({
            organizationId: orgId,
            userId,
            roleAtCreation:
              classroom.level === "elementary" ? "teacher-elementary" : "teacher-primary",
          })
          .returning({ id: montessoriAgentThreads.id });
        threadId = created!.id;
      }

      // Persist the user's message. We log lightweight metadata
      // about media but never the bytes — see the privacy comment
      // at the top of the file.
      const inputMethod = photoBuffer ? "photo" : audioBuffer ? "voice" : "text";
      const attachmentMeta =
        photoBuffer || audioBuffer
          ? {
              photo: photoBuffer
                ? { mimeType: photoMime, sizeBytes: photoBuffer.byteLength }
                : null,
              audio: audioBuffer
                ? { mimeType: audioMime, sizeBytes: audioBuffer.byteLength }
                : null,
            }
          : null;
      await db.insert(montessoriAgentMessages).values({
        threadId,
        role: "user",
        text: text ?? null,
        inputMethod,
        attachmentMeta,
      });

      // Run interpretation. Buffers are passed by reference; the
      // service treats them as ephemeral and does not retain.
      const today = new Date().toISOString().slice(0, 10);
      const envelope = await montessoriInterpretationService.interpret({
        text: text ?? null,
        photo: photoBuffer && photoMime ? { bytes: photoBuffer, mimeType: photoMime } : null,
        audio: audioBuffer && audioMime ? { bytes: audioBuffer, mimeType: audioMime } : null,
        classroom: {
          id: classroom.id,
          name: classroom.name,
          level: classroom.level as "primary" | "elementary" | "both",
        },
        roster: students,
        topics: interpretationTopics,
        observations: interpretationObservations,
        today,
      });

      // Persist the agent's reply. The proposals ride on the
      // `card` JSON column — the review UI in 4.1 reads them
      // straight from there when re-opening a past thread.
      const [agentMsg] = await db
        .insert(montessoriAgentMessages)
        .values({
          threadId,
          role: "agent",
          text: envelope.summary,
          card: envelope as unknown as Record<string, unknown>,
          inputMethod: "agent",
        })
        .returning({ id: montessoriAgentMessages.id });

      res.json({
        threadId,
        messageId: agentMsg!.id,
        envelope,
      });
    } catch (error) {
      logger.error({ error }, "POST /agent/interpret failed");
      res.status(500).json({ error: "internal_error" });
    } finally {
      // Drop our references to the raw bytes so the GC can reclaim
      // them as soon as Gemini's response has been parsed. multer
      // doesn't hold its own copy past the request lifecycle.
      photoBuffer = null;
      audioBuffer = null;
    }
  }
);

// ─── POST /agent/confirm ─────────────────────────────────────────────
//
// Applies a ProposedUpdatesEnvelope to the DB in one transaction.
// The envelope sent here is the (possibly edited) version from the
// review UI — same shape as what /interpret returned, but the user
// may have tweaked levels, notes, or section narratives. We re-
// validate against the Zod schema and re-check that every studentId /
// topicId / classroomId still belongs to this org. Either every
// proposal lands or none do.

const ConfirmBody = z.object({
  threadId: z.string().uuid(),
  /** The agent message that produced the envelope. We stamp every
   *  written row with this id so later reads can attribute the
   *  observation/attendance/report to the conversation that
   *  proposed it. */
  sourceMessageId: z.string().uuid(),
  envelope: ProposedUpdatesEnvelopeSchema,
});

interface AppliedSummary {
  observationIds: string[];
  attendanceIds: string[];
  reportIds: string[];
}

router.post("/agent/confirm", async (req: Request, res: Response): Promise<void> => {
  try {
    const orgId = req.organizationId!;
    const userId = req.userId!;
    const parsed = ConfirmBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body", issues: parsed.error.issues });
      return;
    }
    const { threadId, sourceMessageId, envelope } = parsed.data;

    // Thread + message ownership check before we start the txn.
    const [thread] = await db
      .select({ id: montessoriAgentThreads.id })
      .from(montessoriAgentThreads)
      .where(
        and(
          eq(montessoriAgentThreads.id, threadId),
          eq(montessoriAgentThreads.organizationId, orgId),
          eq(montessoriAgentThreads.userId, userId)
        )
      )
      .limit(1);
    if (!thread) {
      res.status(404).json({ error: "thread_not_found" });
      return;
    }

    const [sourceMessage] = await db
      .select({ id: montessoriAgentMessages.id })
      .from(montessoriAgentMessages)
      .where(
        and(
          eq(montessoriAgentMessages.id, sourceMessageId),
          eq(montessoriAgentMessages.threadId, threadId)
        )
      )
      .limit(1);
    if (!sourceMessage) {
      res.status(404).json({ error: "source_message_not_found" });
      return;
    }

    // Pre-flight ownership checks. Doing this outside the
    // transaction keeps the txn short — by the time we start
    // writing we already know every id is legit.
    const studentIds = Array.from(new Set(envelope.proposals.map((p) => p.studentId)));
    const topicIds = Array.from(
      new Set(
        envelope.proposals
          .filter((p): p is Extract<typeof p, { kind: "observation" }> => p.kind === "observation")
          .map((p) => p.topicId)
      )
    );
    const classroomIds = Array.from(
      new Set(
        envelope.proposals
          .filter(
            (p): p is Extract<typeof p, { kind: "report-draft" }> => p.kind === "report-draft"
          )
          .map((p) => p.classroomId)
      )
    );

    if (studentIds.length > 0) {
      const valid = await db
        .select({ id: montessoriStudents.id })
        .from(montessoriStudents)
        .where(
          and(
            eq(montessoriStudents.organizationId, orgId),
            inArray(montessoriStudents.id, studentIds)
          )
        );
      if (valid.length !== studentIds.length) {
        res.status(400).json({ error: "students_outside_org" });
        return;
      }
    }
    if (topicIds.length > 0) {
      const valid = await db
        .select({ id: montessoriTopics.id })
        .from(montessoriTopics)
        .where(
          and(eq(montessoriTopics.organizationId, orgId), inArray(montessoriTopics.id, topicIds))
        );
      if (valid.length !== topicIds.length) {
        res.status(400).json({ error: "topics_outside_org" });
        return;
      }
    }
    if (classroomIds.length > 0) {
      const valid = await db
        .select({ id: montessoriClassrooms.id })
        .from(montessoriClassrooms)
        .where(
          and(
            eq(montessoriClassrooms.organizationId, orgId),
            inArray(montessoriClassrooms.id, classroomIds)
          )
        );
      if (valid.length !== classroomIds.length) {
        res.status(400).json({ error: "classrooms_outside_org" });
        return;
      }
    }

    // Apply everything inside a single txn so a failure mid-loop
    // rolls back the partial writes. The teacher sees either
    // the full set of changes or none.
    const applied: AppliedSummary = await db.transaction(async (tx) => {
      const observationIds: string[] = [];
      const attendanceIds: string[] = [];
      const reportIds: string[] = [];

      for (const p of envelope.proposals) {
        if (p.kind === "observation") {
          const [row] = await tx
            .insert(montessoriObservations)
            .values({
              organizationId: orgId,
              studentId: p.studentId,
              topicId: p.topicId,
              level: p.level,
              note: p.note,
              inputMethod: "agent",
              authorType: "agent",
              authorAgentMessageId: sourceMessageId,
            })
            .returning({ id: montessoriObservations.id });
          observationIds.push(row!.id);
        } else if (p.kind === "attendance") {
          const [row] = await tx
            .insert(montessoriAttendance)
            .values({
              organizationId: orgId,
              studentId: p.studentId,
              date: p.date,
              status: p.status,
              note: p.note,
              authorAgentMessageId: sourceMessageId,
            })
            .onConflictDoUpdate({
              target: [montessoriAttendance.studentId, montessoriAttendance.date],
              set: {
                status: sql`excluded.status`,
                note: sql`excluded.note`,
                authorAgentMessageId: sourceMessageId,
                updatedAt: new Date(),
              },
            })
            .returning({ id: montessoriAttendance.id });
          attendanceIds.push(row!.id);
        } else {
          // report-draft
          const [row] = await tx
            .insert(montessoriReports)
            .values({
              organizationId: orgId,
              studentId: p.studentId,
              classroomId: p.classroomId,
              type: p.type,
              status: "draft",
              summary: p.reportSummary,
              sections: p.sections,
            })
            .returning({ id: montessoriReports.id });
          reportIds.push(row!.id);
        }
      }

      // Audit message in the thread so the chat UI shows the
      // confirmation as a turn (and so re-opening the thread
      // shows what was applied vs what was just proposed).
      await tx.insert(montessoriAgentMessages).values({
        threadId,
        role: "user",
        text: `Confirmed ${envelope.proposals.length} update${envelope.proposals.length === 1 ? "" : "s"}.`,
        inputMethod: "agent",
        card: {
          kind: "confirmation-receipt",
          observationIds,
          attendanceIds,
          reportIds,
        } as Record<string, unknown>,
      });

      return { observationIds, attendanceIds, reportIds };
    });

    res.json({ applied });
  } catch (error) {
    logger.error({ error }, "POST /agent/confirm failed");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
