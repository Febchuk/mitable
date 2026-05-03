import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";

/**
 * Telemetry endpoint. Accepts a batch of structural events with no PII.
 * Per IMPLEMENTATION_PLAN.md §8.1, payloads are limited to known event names
 * with structural fields only — anything else is rejected to keep PII out by
 * construction.
 *
 * This route is best-effort: failures are silently dropped to keep the client
 * buffer from spinning. The actual storage (Supabase telemetry table or an
 * external service) plugs in here once the schema lands.
 */

const EventSchema = z.discriminatedUnion("name", [
  z.object({ name: z.literal("command_parse_failed"), category: z.string().max(64) }),
  z.object({
    name: z.literal("whisper_transcription_corrected"),
    editDistance: z.number().int().nonnegative(),
    lengthBucket: z.enum(["short", "medium", "long"]),
  }),
  z.object({ name: z.literal("ocr_confidence_low"), confidence: z.number() }),
  z.object({ name: z.literal("sync_conflict"), reason: z.string().max(64) }),
  z.object({
    name: z.literal("tool_validation_failed"),
    tool: z.string().max(64),
    errorType: z.string().max(64),
  }),
  z.object({
    name: z.literal("agent_loop_aborted"),
    turns: z.number().int().nonnegative(),
    reason: z.string().max(64),
  }),
  z.object({ name: z.literal("capture_started"), mode: z.enum(["text", "voice", "photo"]) }),
  z.object({
    name: z.literal("capture_completed"),
    mode: z.enum(["text", "voice", "photo"]),
    proposalCount: z.number().int().nonnegative(),
    durationMs: z.number().nonnegative(),
  }),
  z.object({
    name: z.literal("capture_abandoned"),
    mode: z.enum(["text", "voice", "photo"]),
    reason: z.string().max(64),
  }),
  z.object({ name: z.literal("model_load_started"), engine: z.enum(["asr", "ocr"]) }),
  z.object({
    name: z.literal("model_load_completed"),
    engine: z.enum(["asr", "ocr"]),
    durationMs: z.number().nonnegative(),
  }),
  z.object({
    name: z.literal("model_load_failed"),
    engine: z.enum(["asr", "ocr"]),
    message: z.string().max(256),
  }),
]);

const BatchSchema = z.object({
  events: z
    .array(z.object({ event: EventSchema, timestamp: z.string().datetime() }))
    .min(1)
    .max(100),
});

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = BatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid telemetry batch", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Storage plugs in here. For now, accept-and-ack so the client buffer
  // drains. Once the Supabase telemetry table lands, fan out parsed.data
  // .events with auth.userId / auth.schoolId tagging.
  return NextResponse.json({ accepted: parsed.data.events.length });
}
