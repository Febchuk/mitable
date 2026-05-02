/**
 * Phase 1 checkpoint end-to-end test.
 *
 * Verifies the teacher-text-capture loop end-to-end on the client side:
 *   1. Type "mark Maya present and add pink tower practicing"
 *   2. Tokenize against the local roster + curriculum (Fuse.js)
 *   3. Send to /api/parse-command (mocked Haiku) — get back two tool calls
 *   4. De-tokenize the two tool calls back to real student/subtopic ids
 *   5. Apply both — assert two pending unsynced commands and updated projections
 *   6. Drain the sync worker — assert /api/v1/sync/commands receives the right
 *      payload and that syncedAt is stamped on both rows
 *
 * The Anthropic + Supabase HTTP boundaries are stubbed via global fetch; every
 * other layer (Dexie, encryption, tokenizer, detokenizer, projection writes,
 * sync worker logic) is exercised for real.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stub the sync worker's auto-kick BEFORE the apply module imports it. Otherwise
// `applyApprovedToolCall` would fire a background drain that races with our
// explicit assertions about the pre- and post-sync state.
vi.mock("@/lib/sync/worker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sync/worker")>();
  return {
    ...actual,
    notifySyncWorker: vi.fn(),
    startSyncWorker: vi.fn(),
  };
});

import { initSessionKeys, clearSessionKeys, bufferToBase64 } from "@/lib/crypto/session-key";
import { prepareEncryptedRoster, rosterNameHash } from "@/lib/db/encrypted-fields";
import { clearDb, getDb } from "@/lib/db/schema";
import { applyApprovedToolCall } from "@/lib/commands/apply";
import { detokenizeToolCall, describeDetokenized } from "@/lib/tokenize/detokenize";
import { invalidateRosterIndex } from "@/lib/tokenize/roster-index";
import { tokenizeText } from "@/lib/tokenize/tokenize";
import { ParsedToolCallSchema } from "@/lib/schemas/parsed-tool-call";
import { drainOnceForTest } from "./helpers";

const SCHOOL_ID = "11111111-1111-1111-1111-111111111111";
const CLASSROOM_ID = "22222222-2222-2222-2222-222222222222";
const TEACHER_ID = "33333333-3333-3333-3333-333333333333";
const CURRICULUM_ID = "44444444-4444-4444-4444-444444444444";
const TOPIC_ID = "55555555-5555-5555-5555-555555555555";
const STUDENT_MAYA_ID = "66666666-6666-6666-6666-666666666666";
const STUDENT_LEO_ID = "77777777-7777-7777-7777-777777777777";
const SUBTOPIC_PINK_TOWER_ID = "88888888-8888-8888-8888-888888888888";

async function seedDexie() {
  // Fresh AES + HMAC session keys derived from a stable salt so encryption works.
  const salt = bufferToBase64(crypto.getRandomValues(new Uint8Array(16)).buffer);
  await initSessionKeys({ userId: TEACHER_ID, schoolId: SCHOOL_ID, saltB64: salt });

  const db = getDb();

  const mayaHash = await rosterNameHash("Maya", "Singh");
  const harperHash = await rosterNameHash("Harper", "Williamson");

  const mayaEnc = await prepareEncryptedRoster({
    id: STUDENT_MAYA_ID,
    schoolId: SCHOOL_ID,
    firstName: "Maya",
    lastName: "Singh",
    preferredName: null,
    birthDate: null,
    nicknames: [],
    notes: null,
    nameHash: mayaHash,
  });
  // A second roster entry whose name shares no characters with "Maya" — the
  // Fuse threshold (0.4) is loose enough that any short overlap can flip the
  // match, and we want this test to assert the pipeline, not Fuse tuning.
  const harperEnc = await prepareEncryptedRoster({
    id: STUDENT_LEO_ID,
    schoolId: SCHOOL_ID,
    firstName: "Harper",
    lastName: "Williamson",
    preferredName: null,
    birthDate: null,
    nicknames: [],
    notes: null,
    nameHash: harperHash,
  });

  await db.roster.bulkPut([mayaEnc, harperEnc]);

  await db.classrooms.put({
    id: CLASSROOM_ID,
    schoolId: SCHOOL_ID,
    curriculumId: CURRICULUM_ID,
    name: "Sunflower Room",
    code: "SUN",
    status: "active",
  });

  await db.classroomTeachers.put({
    id: "teacher-assignment-1",
    classroomId: CLASSROOM_ID,
    teacherUserId: TEACHER_ID,
    classroomRole: "lead",
    startDate: "2026-01-01",
    endDate: null,
  });

  await db.curricula.put({
    id: CURRICULUM_ID,
    schoolId: SCHOOL_ID,
    name: "Default Montessori",
    framework: "montessori",
    isActive: true,
  });

  await db.curriculumTopics.put({
    id: TOPIC_ID,
    curriculumId: CURRICULUM_ID,
    name: "Sensorial",
    sortOrder: 1,
    isActive: true,
  });

  await db.curriculumSubtopics.put({
    id: SUBTOPIC_PINK_TOWER_ID,
    topicId: TOPIC_ID,
    name: "Pink Tower",
    sortOrder: 1,
    isActive: true,
    aliases: ["pink tower"],
  });

  invalidateRosterIndex();
}

describe("Phase 1 — teacher text capture loop", () => {
  beforeEach(async () => {
    await clearDb();
    invalidateRosterIndex();
    clearSessionKeys();
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await clearDb();
    invalidateRosterIndex();
    clearSessionKeys();
    vi.restoreAllMocks();
  });

  it("typed sentence → two pending commands → projections updated → sync drains both", async () => {
    await seedDexie();

    // 1. Tokenize the teacher's utterance.
    const utterance = "mark Maya present and add pink tower practicing";
    const tokenized = await tokenizeText(utterance);

    expect(tokenized.ambiguous).toBe(false);
    expect(tokenized.tokenizedText).toMatch(/\[STUDENT_\d+\]/);
    expect(tokenized.tokenizedText).toMatch(/\[SUBTOPIC_\d+\]/);
    // No real names should remain in the tokenized text.
    expect(tokenized.tokenizedText.toLowerCase()).not.toContain("maya");
    expect(tokenized.tokenizedText.toLowerCase()).not.toContain("pink tower");

    const studentRef = tokenized.references.find((r) => r.kind === "student");
    const subtopicRef = tokenized.references.find((r) => r.kind === "subtopic");
    expect(studentRef).toBeDefined();
    expect(subtopicRef).toBeDefined();
    // The fuzzy roster index resolves "Maya" to Maya Singh (closest match among
    // the two seeded students). Pink Tower is the only subtopic.
    expect(studentRef!.id).toBe(STUDENT_MAYA_ID);
    expect(subtopicRef!.id).toBe(SUBTOPIC_PINK_TOWER_ID);

    const studentToken = studentRef!.token;
    const subtopicToken = subtopicRef!.token;
    const classroomToken = "[CLASSROOM_0]";

    // 2. Stub /api/parse-command to return two tool calls (the shape the real
    //    route handler returns after Haiku parses the tokenized prompt).
    const parseResponseBody = {
      toolCalls: [
        {
          tool: "mark_attendance",
          args: {
            student_token: studentToken,
            classroom_token: classroomToken,
            status: "present",
            date: "2026-05-01",
          },
        },
        {
          tool: "record_progress",
          args: {
            student_token: studentToken,
            subtopic_token: subtopicToken,
            classroom_token: classroomToken,
            status: "practicing",
          },
        },
      ],
    };

    // Track every fetch call so we can assert against the sync POST later.
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/v1/ai/parse-command")) {
        return new Response(JSON.stringify(parseResponseBody), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/api/v1/sync/commands")) {
        const bodyText = typeof init?.body === "string" ? init.body : "";
        const body = JSON.parse(bodyText) as { commands: Array<{ client_id: string }> };
        return new Response(JSON.stringify({ synced: body.commands.map((c) => c.client_id) }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    // Mirror what `components/chat/Composer.tsx` actually posts: drop the
    // `display` field so real names never leave the device.
    const parseRes = await fetch("/api/v1/ai/parse-command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tokenizedText: tokenized.tokenizedText,
        references: tokenized.references.map((r) => ({
          token: r.token,
          ref: r.id,
          kind: r.kind,
        })),
        classroomId: CLASSROOM_ID,
        todayIso: "2026-05-01",
      }),
    });
    expect(parseRes.ok).toBe(true);
    const { toolCalls } = (await parseRes.json()) as { toolCalls: unknown[] };
    expect(toolCalls).toHaveLength(2);

    // Validate against the wire schema, then de-tokenize.
    const validatedCalls = toolCalls.map((c) => ParsedToolCallSchema.parse(c));
    const detokenized = validatedCalls
      .map((c) => detokenizeToolCall(c, tokenized.references, CLASSROOM_ID))
      .filter((c): c is NonNullable<typeof c> => c !== null);

    expect(detokenized).toHaveLength(2);
    expect(detokenized[0]).toMatchObject({
      kind: "attendance",
      studentId: STUDENT_MAYA_ID,
      classroomId: CLASSROOM_ID,
      status: "present",
      date: "2026-05-01",
    });
    expect(detokenized[1]).toMatchObject({
      kind: "progress",
      studentId: STUDENT_MAYA_ID,
      subtopicId: SUBTOPIC_PINK_TOWER_ID,
      classroomId: CLASSROOM_ID,
      status: "practicing",
    });

    // 3. Persist proposals so applyApprovedToolCall can update them.
    const db = getDb();
    const proposalIds: string[] = [];
    for (const call of detokenized) {
      const id = `proposal-${crypto.randomUUID()}`;
      proposalIds.push(id);
      await db.chatProposals.put({
        id,
        threadId: "thread-test",
        createdAt: new Date().toISOString(),
        status: "proposed",
        toolName: call.kind === "attendance" ? "mark_attendance" : "record_progress",
        tokenizedPayload: {},
        resolvedPayload: call as unknown as Record<string, unknown>,
        display: describeDetokenized(call),
      });
    }

    // 4. Approve both — applyApprovedToolCall writes the command + projection
    //    rows in one Dexie transaction and queues for sync.
    for (let i = 0; i < detokenized.length; i++) {
      const result = await applyApprovedToolCall(detokenized[i], {
        schoolId: SCHOOL_ID,
        userId: TEACHER_ID,
        classroomId: CLASSROOM_ID,
        rawTranscript: utterance,
        proposalId: proposalIds[i],
      });
      expect(result).not.toBeNull();
    }

    // 5. Two approved unsynced commands now exist locally.
    const allCommands = await db.commands.toArray();
    expect(allCommands).toHaveLength(2);
    expect(allCommands.every((c) => c.status === "approved")).toBe(true);
    expect(allCommands.every((c) => c.syncedAt === null)).toBe(true);
    expect(new Set(allCommands.map((c) => c.commandType))).toEqual(
      new Set(["attendance", "progress"])
    );

    // Local projections updated immediately (this is what the Today/Attendance/
    // Progress UI reads from).
    const attendanceRow = await db.attendanceProj.get([
      "66666666-6666-6666-6666-666666666666",
      "2026-05-01",
    ]);
    expect(attendanceRow).toMatchObject({
      studentId: STUDENT_MAYA_ID,
      date: "2026-05-01",
      status: "present",
    });

    const progressRow = await db.progressProj.get([
      STUDENT_MAYA_ID,
      SUBTOPIC_PINK_TOWER_ID,
      CLASSROOM_ID,
    ]);
    expect(progressRow).toMatchObject({
      studentId: STUDENT_MAYA_ID,
      subtopicId: SUBTOPIC_PINK_TOWER_ID,
      classroomId: CLASSROOM_ID,
      status: "practicing",
    });

    // Both proposals flipped to approved with their commandId stamped.
    const updatedProposals = await db.chatProposals.toArray();
    expect(updatedProposals.every((p) => p.status === "approved")).toBe(true);
    expect(updatedProposals.every((p) => typeof p.commandId === "string")).toBe(true);

    // 6. Drain the sync worker. Assert the POST body shape and that syncedAt is
    //    stamped on both rows after the server acks.
    const drained = await drainOnceForTest();
    expect(drained).toBe(2);

    const syncCalls = fetchMock.mock.calls.filter(([input]) => {
      const url = typeof input === "string" ? input : input.toString();
      return url.endsWith("/api/v1/sync/commands");
    });
    expect(syncCalls).toHaveLength(1);
    const body = JSON.parse((syncCalls[0][1]?.body as string) ?? "{}") as {
      commands: Array<{
        command_type: string;
        classroom_id: string;
        source: string;
        payload: Record<string, unknown>;
        client_id: string;
      }>;
    };
    expect(body.commands).toHaveLength(2);
    expect(body.commands.every((c) => c.classroom_id === CLASSROOM_ID)).toBe(true);
    expect(body.commands.every((c) => c.source === "text")).toBe(true);

    const synced = await db.commands.toArray();
    expect(synced.every((c) => typeof c.syncedAt === "string" && c.syncedAt!.length > 0)).toBe(
      true
    );

    // Privacy invariant: the parse-command body should NOT have contained any
    // real names — only tokens — and the sync body uses real student ids only
    // inside the structured payload, not raw names.
    const parseCalls = fetchMock.mock.calls.filter(([input]) => {
      const url = typeof input === "string" ? input : input.toString();
      return url.endsWith("/api/v1/ai/parse-command");
    });
    const parseBody = JSON.parse((parseCalls[0][1]?.body as string) ?? "{}");
    const parseBodyJson = JSON.stringify(parseBody);
    expect(parseBodyJson.toLowerCase()).not.toContain("maya");
    expect(parseBodyJson.toLowerCase()).not.toContain("singh");
    expect(parseBodyJson.toLowerCase()).not.toContain("pink tower");
  });
});
