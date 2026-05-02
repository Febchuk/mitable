/**
 * Phase 2 checkpoint end-to-end test.
 *
 * Verifies the voice + photo capture loops end-to-end on the client side:
 *   1. Stubbed Whisper / Tesseract engines return scripted transcripts
 *   2. Each transcript flows through the same client-side tokenizer →
 *      /api/parse-command (mocked) → detokenize → proposal staging path
 *   3. Approving each proposal writes commands with the correct `source`
 *      ("voice" or "photo"), updates projections, and queues for sync
 *   4. The sync worker drains both batches and stamps `syncedAt`
 *
 * The test does NOT exercise the real transformers.js or tesseract.js stacks —
 * those need a full browser + GPU + ~150MB of model assets. Their integration
 * sits behind the engine factory in `lib/capture/engines.ts`, which we swap
 * out via `setCaptureFactoriesForTest`. The pipeline contract is what matters,
 * and that's what this test pins down.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { invalidateRosterIndex } from "@/lib/tokenize/roster-index";
import {
  setCaptureFactoriesForTest,
  resetCaptureFactories,
  StubAsrEngine,
  StubOcrEngine,
  getAsrEngine,
  getOcrEngine,
} from "@/lib/capture/engines";
import { parseAndStageProposals } from "@/lib/capture/parse-pipeline";
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

function buildFetchMock(
  parseResponse: { toolCalls: unknown[] },
  fetchSpy: ReturnType<typeof vi.fn>
): typeof fetch {
  const impl = async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchSpy(input, init);
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/api/v1/ai/parse-command")) {
      return new Response(JSON.stringify(parseResponse), {
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
    if (url.endsWith("/api/v1/telemetry")) {
      return new Response(JSON.stringify({ accepted: 0 }), { status: 200 });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
  return impl as unknown as typeof fetch;
}

const ATTENDANCE_AND_PROGRESS_TOOLCALLS = (studentToken: string, subtopicToken: string) => ({
  toolCalls: [
    {
      tool: "mark_attendance",
      args: {
        student_token: studentToken,
        classroom_token: "[CLASSROOM_0]",
        status: "present",
        date: "2026-05-01",
      },
    },
    {
      tool: "record_progress",
      args: {
        student_token: studentToken,
        subtopic_token: subtopicToken,
        classroom_token: "[CLASSROOM_0]",
        status: "practicing",
      },
    },
  ],
});

describe("Phase 2 — voice + photo capture loops", () => {
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
    resetCaptureFactories();
    vi.restoreAllMocks();
  });

  it("voice transcript → tokenize → parse → approve → command(source='voice') synced", async () => {
    await seedDexie();

    // The stub Whisper engine returns the scripted transcript when the UI
    // hands it raw audio. The DictationButton (not exercised here) would
    // call this in reaction to a stop event; we drive it directly.
    const transcript = "mark Maya present and add pink tower practicing";
    setCaptureFactoriesForTest({
      createAsr: () => new StubAsrEngine(() => transcript),
      createOcr: () => new StubOcrEngine(() => ""),
    });
    const asr = getAsrEngine();
    await asr.init();
    const recognized = await asr.transcribe(new Float32Array(16_000), 16_000);
    expect(recognized.text).toBe(transcript);

    // Pre-figure the tokens the parse-command mock will echo. The pipeline
    // tokenizes locally first, so we know what to expect.
    const fetchSpy = vi.fn();
    const parsePayload = ATTENDANCE_AND_PROGRESS_TOOLCALLS("[STUDENT_1]", "[SUBTOPIC_1]");
    vi.stubGlobal("fetch", buildFetchMock(parsePayload, fetchSpy));

    const result = await parseAndStageProposals({
      threadId: "thread-voice",
      classroomId: CLASSROOM_ID,
      rawText: recognized.text,
      mode: "voice",
      todayIso: "2026-05-01",
    });
    expect(result.proposals).toHaveLength(2);

    // Approve both proposals with source="voice".
    const db = getDb();
    for (const p of result.proposals) {
      const r = await applyApprovedToolCall(p.call, {
        schoolId: SCHOOL_ID,
        userId: TEACHER_ID,
        classroomId: CLASSROOM_ID,
        rawTranscript: recognized.text,
        proposalId: p.proposalId,
        source: "voice",
      });
      expect(r).not.toBeNull();
    }

    const all = await db.commands.toArray();
    expect(all).toHaveLength(2);
    expect(all.every((c) => c.source === "voice")).toBe(true);
    expect(all.every((c) => c.syncedAt === null)).toBe(true);

    // Drain.
    const drained = await drainOnceForTest();
    expect(drained).toBe(2);
    const synced = await db.commands.toArray();
    expect(synced.every((c) => c.source === "voice" && c.syncedAt)).toBe(true);

    // Privacy: parse-command body sees tokens only.
    const parseCalls = fetchSpy.mock.calls.filter((c) => {
      const url = typeof c[0] === "string" ? c[0] : c[0].toString();
      return url.endsWith("/api/v1/ai/parse-command");
    });
    const parseBody = JSON.parse((parseCalls[0][1]?.body as string) ?? "{}");
    const parseBodyJson = JSON.stringify(parseBody).toLowerCase();
    expect(parseBodyJson).not.toContain("maya");
    expect(parseBodyJson).not.toContain("singh");
    expect(parseBodyJson).not.toContain("pink tower");

    // Sync body carries source="voice".
    const syncCall = fetchSpy.mock.calls.find((c) => {
      const url = typeof c[0] === "string" ? c[0] : c[0].toString();
      return url.endsWith("/api/v1/sync/commands");
    });
    const syncBody = JSON.parse((syncCall![1]?.body as string) ?? "{}") as {
      commands: Array<{ source: string }>;
    };
    expect(syncBody.commands.every((c) => c.source === "voice")).toBe(true);
  });

  it("photo OCR → tokenize → parse → approve → command(source='photo') synced", async () => {
    await seedDexie();

    const ocrText = "mark Maya present and add pink tower practicing";
    setCaptureFactoriesForTest({
      createAsr: () => new StubAsrEngine(() => ""),
      createOcr: () => new StubOcrEngine(() => ocrText),
    });
    const ocr = getOcrEngine();
    await ocr.init();
    const recognized = await ocr.recognize(new Blob([new Uint8Array(8)], { type: "image/jpeg" }));
    expect(recognized.text).toBe(ocrText);

    const fetchSpy = vi.fn();
    const parsePayload = ATTENDANCE_AND_PROGRESS_TOOLCALLS("[STUDENT_1]", "[SUBTOPIC_1]");
    vi.stubGlobal("fetch", buildFetchMock(parsePayload, fetchSpy));

    const result = await parseAndStageProposals({
      threadId: "thread-photo",
      classroomId: CLASSROOM_ID,
      rawText: recognized.text,
      mode: "photo",
      todayIso: "2026-05-01",
    });
    expect(result.proposals).toHaveLength(2);

    const db = getDb();
    for (const p of result.proposals) {
      const r = await applyApprovedToolCall(p.call, {
        schoolId: SCHOOL_ID,
        userId: TEACHER_ID,
        classroomId: CLASSROOM_ID,
        rawTranscript: recognized.text,
        proposalId: p.proposalId,
        source: "photo",
      });
      expect(r).not.toBeNull();
    }

    const all = await db.commands.toArray();
    expect(all).toHaveLength(2);
    expect(all.every((c) => c.source === "photo")).toBe(true);

    const drained = await drainOnceForTest();
    expect(drained).toBe(2);
    const synced = await db.commands.toArray();
    expect(synced.every((c) => c.source === "photo" && c.syncedAt)).toBe(true);

    // Photo path also keeps PII off the wire.
    const parseCalls = fetchSpy.mock.calls.filter((c) => {
      const url = typeof c[0] === "string" ? c[0] : c[0].toString();
      return url.endsWith("/api/v1/ai/parse-command");
    });
    const parseBody = JSON.parse((parseCalls[0][1]?.body as string) ?? "{}");
    const parseBodyJson = JSON.stringify(parseBody).toLowerCase();
    expect(parseBodyJson).not.toContain("maya");
    expect(parseBodyJson).not.toContain("singh");
    expect(parseBodyJson).not.toContain("pink tower");
  });

  it("attendance + progress projections updated regardless of capture source", async () => {
    await seedDexie();

    setCaptureFactoriesForTest({
      createAsr: () => new StubAsrEngine(() => "mark Maya present"),
      createOcr: () => new StubOcrEngine(() => "pink tower practicing for Maya"),
    });

    const fetchSpy = vi.fn();
    const parsePayload = ATTENDANCE_AND_PROGRESS_TOOLCALLS("[STUDENT_1]", "[SUBTOPIC_1]");
    vi.stubGlobal("fetch", buildFetchMock(parsePayload, fetchSpy));

    // Run the voice path then the photo path against the same student.
    const voiceResult = await parseAndStageProposals({
      threadId: "thread-mixed-1",
      classroomId: CLASSROOM_ID,
      rawText: "mark Maya present and add pink tower practicing",
      mode: "voice",
      todayIso: "2026-05-01",
    });
    for (const p of voiceResult.proposals) {
      await applyApprovedToolCall(p.call, {
        schoolId: SCHOOL_ID,
        userId: TEACHER_ID,
        classroomId: CLASSROOM_ID,
        rawTranscript: "mark Maya present and add pink tower practicing",
        proposalId: p.proposalId,
        source: "voice",
      });
    }

    const db = getDb();
    const att = await db.attendanceProj.get([STUDENT_MAYA_ID, "2026-05-01"]);
    expect(att?.status).toBe("present");
    const prog = await db.progressProj.get([STUDENT_MAYA_ID, SUBTOPIC_PINK_TOWER_ID, CLASSROOM_ID]);
    expect(prog?.status).toBe("practicing");

    // Now a photo arrives and changes the progress to mastered. Verify the
    // projection updates and a fresh command row carries source='photo'.
    const photoParse = {
      toolCalls: [
        {
          tool: "record_progress",
          args: {
            student_token: "[STUDENT_1]",
            subtopic_token: "[SUBTOPIC_1]",
            classroom_token: "[CLASSROOM_0]",
            status: "mastered",
          },
        },
      ],
    };
    vi.stubGlobal("fetch", buildFetchMock(photoParse, fetchSpy));

    const photoResult = await parseAndStageProposals({
      threadId: "thread-mixed-2",
      classroomId: CLASSROOM_ID,
      rawText: "Maya pink tower mastered",
      mode: "photo",
      todayIso: "2026-05-01",
    });
    expect(photoResult.proposals).toHaveLength(1);
    for (const p of photoResult.proposals) {
      await applyApprovedToolCall(p.call, {
        schoolId: SCHOOL_ID,
        userId: TEACHER_ID,
        classroomId: CLASSROOM_ID,
        rawTranscript: "Maya pink tower mastered",
        proposalId: p.proposalId,
        source: "photo",
      });
    }

    const updated = await db.progressProj.get([
      STUDENT_MAYA_ID,
      SUBTOPIC_PINK_TOWER_ID,
      CLASSROOM_ID,
    ]);
    expect(updated?.status).toBe("mastered");

    const sourceMix = (await db.commands.toArray()).map((c) => c.source).sort();
    expect(sourceMix).toEqual(["photo", "voice", "voice"]);
  });
});
