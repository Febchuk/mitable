import { Router, type Request, type Response } from "express";
import multer from "multer";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../../db/client.js";
import { requireAuth } from "../../auth/middleware/auth.js";
import { createLogger } from "../../shared-infra/lib/logger.js";
import {
    montessoriAgentMessages,
    montessoriAgentThreads,
    montessoriClassrooms,
    montessoriDomains,
    montessoriStudents,
    montessoriTopics,
} from "../schema/montessori.schema.js";
import { montessoriInterpretationService } from "../services/montessori-interpretation.service.js";
import type { InterpretationTopic } from "../services/montessori-interpretation.service.js";

const logger = createLogger({ module: "MontessoriAgent" });

const router = Router();
router.use(requireAuth);

/**
 * /agent endpoints — the draft-and-confirm loop.
 *
 *   POST /agent/interpret   capture (text +/- photo +/- audio) → ProposedUpdates
 *   POST /agent/confirm     ProposedUpdates → DB writes (lands in 2.5)
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
                        and(
                            eq(montessoriDomains.organizationId, orgId),
                            eq(montessoriDomains.active, true)
                        )
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
                        and(
                            eq(montessoriTopics.organizationId, orgId),
                            eq(montessoriTopics.active, true)
                        )
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
                        roleAtCreation: classroom.level === "elementary" ? "teacher-elementary" : "teacher-primary",
                    })
                    .returning({ id: montessoriAgentThreads.id });
                threadId = created!.id;
            }

            // Persist the user's message. We log lightweight metadata
            // about media but never the bytes — see the privacy comment
            // at the top of the file.
            const inputMethod = photoBuffer ? "photo" : audioBuffer ? "voice" : "text";
            const attachmentMeta = (photoBuffer || audioBuffer)
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
                photo: photoBuffer && photoMime
                    ? { bytes: photoBuffer, mimeType: photoMime }
                    : null,
                audio: audioBuffer && audioMime
                    ? { bytes: audioBuffer, mimeType: audioMime }
                    : null,
                classroom: {
                    id: classroom.id,
                    name: classroom.name,
                    level: classroom.level as "primary" | "elementary" | "both",
                },
                roster: students,
                topics: interpretationTopics,
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

export default router;
