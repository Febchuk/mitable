import type { SupabaseClient } from "@supabase/supabase-js";
import { buildBuiltinReportTemplateId } from "@/lib/reports/default-template";
import { ARG_SCHEMAS } from "./tools";
import type { AgentApplyResult, AgentProposal } from "./types";

/**
 * Applies one confirmed proposal. Writes reuse the existing session-authed
 * endpoints via a same-origin call that forwards the teacher's cookies, so each
 * endpoint's own auth (classroom assignment), validation, and audit logging
 * still run — the agent adds no privileged write path of its own.
 */
export interface ApplyInput {
  req: Request;
  admin: SupabaseClient;
  schoolId: string;
  classroomId: string;
  proposal: AgentProposal;
}

export async function applyProposal(input: ApplyInput): Promise<AgentApplyResult> {
  const { proposal } = input;
  const schema = ARG_SCHEMAS[proposal.tool];
  if (!schema) return { ok: false, message: "Unknown action." };
  const parsed = schema.safeParse(proposal.args);
  if (!parsed.success) return { ok: false, message: "This action's details are no longer valid." };
  const args = parsed.data as Record<string, unknown>;

  switch (proposal.tool) {
    // Batches are split to respect each endpoint's per-request cap and applied
    // with bounded concurrency, so there is effectively no limit on how many the
    // agent can include in one confirmed action.
    case "mark_attendance": {
      const now = new Date().toISOString();
      const entries = args.entries as Array<{
        studentId: string;
        status: string;
        date?: string;
        comment?: string;
      }>;
      const buildCommand = (e: (typeof entries)[number]) => {
        const payload: Record<string, unknown> = {
          student_id: e.studentId,
          status: e.status,
          date: e.date ?? todayIso(),
        };
        if (e.comment) payload.comment = e.comment;
        return {
          client_id: `agent-${crypto.randomUUID()}`,
          classroom_id: input.classroomId,
          source: "text",
          raw_transcript: null,
          command_type: "attendance",
          payload,
          created_at: now,
          approved_at: now,
        };
      };
      // /sync/commands accepts up to 50 commands per request.
      const subcalls = await mapLimit(chunk(entries, 50), 3, async (group) => ({
        res: await callSelf(input.req, "POST", "/api/v1/sync/commands", {
          commands: group.map(buildCommand),
        }),
        count: group.length,
      }));
      return combine(subcalls, "student", "Marked attendance for");
    }

    case "record_progress": {
      const marks = args.marks as Array<{
        studentId: string;
        subtopicId: string;
        status: string;
        comment?: string;
      }>;
      // /student-progress/bulk accepts up to 200 updates per request.
      const subcalls = await mapLimit(chunk(marks, 200), 3, async (group) => ({
        res: await callSelf(input.req, "POST", "/api/v1/student-progress/bulk", {
          classroomId: input.classroomId,
          updates: group.map((m) => ({
            studentId: m.studentId,
            subtopicId: m.subtopicId,
            status: m.status,
            ...(m.comment ? { comment: m.comment } : {}),
          })),
        }),
        count: group.length,
      }));
      return combine(subcalls, "progress mark", "Recorded");
    }

    case "add_observation": {
      const notes = args.notes as Array<{ studentId: string; text: string }>;
      // /student-comments takes one note per request; loop with light concurrency.
      const subcalls = await mapLimit(notes, 6, async (n) => ({
        res: await callSelf(input.req, "POST", "/api/v1/student-comments", {
          classroomId: input.classroomId,
          studentId: n.studentId,
          comment: n.text,
        }),
        count: 1,
      }));
      return combine(subcalls, "observation", "Saved");
    }

    case "create_daily_report": {
      const studentIds = args.studentIds as string[];
      const subcalls = await mapLimit(studentIds, 4, async (id) => ({
        res: await callSelf(input.req, "POST", "/api/v1/reports", {
          childId: id,
          kind: "Daily",
          templateId: buildBuiltinReportTemplateId("Daily"),
        }),
        count: 1,
      }));
      return combine(subcalls, "draft daily report", "Created");
    }

    case "record_grade": {
      const grades = args.grades as Array<{
        studentId: string;
        termId: string;
        subject: string;
        assessmentName: string;
        percentage: number;
        gradeLabel: string;
      }>;
      // /elementary-grades upserts one grade per request; loop with concurrency.
      const subcalls = await mapLimit(grades, 4, async (g) => ({
        res: await callSelf(input.req, "POST", "/api/v1/elementary-grades", {
          classroomId: input.classroomId,
          studentId: g.studentId,
          termId: g.termId,
          subject: g.subject,
          assessmentName: g.assessmentName,
          percentage: g.percentage,
          gradeLabel: g.gradeLabel,
        }),
        count: 1,
      }));
      return combine(subcalls, "exam grade", "Recorded");
    }

    case "edit_report_section":
      return editReportSection(input, args);

    default:
      return { ok: false, message: "Unknown action." };
  }
}

interface StoredSection {
  id: string;
  heading: string;
  paragraphs: Array<{ id: string; html: string }>;
}

async function editReportSection(
  input: ApplyInput,
  args: Record<string, unknown>
): Promise<AgentApplyResult> {
  const reportId = String(args.reportId);
  const { data } = await input.admin
    .from("reports")
    .select("id, status, sections, students!inner(school_id)")
    .eq("id", reportId)
    .maybeSingle();
  if (!data) return { ok: false, message: "Report not found." };
  const row = data as unknown as {
    status: string;
    sections: StoredSection[] | null;
    students: { school_id: string } | null;
  };
  if (row.students?.school_id !== input.schoolId) {
    return { ok: false, message: "That report isn't in your school." };
  }
  if (row.status !== "draft") {
    return { ok: false, message: "Only draft reports can be edited here." };
  }

  const sections = row.sections ?? [];
  const target = String(args.sectionHeading).trim().toLowerCase();
  const idx = sections.findIndex((s) => s.heading.trim().toLowerCase() === target);
  if (idx === -1) {
    const available = sections.map((s) => `"${s.heading}"`).join(", ") || "none";
    return {
      ok: false,
      message: `No section named "${args.sectionHeading}". Sections: ${available}.`,
    };
  }

  const existing = sections[idx];
  const updated: StoredSection[] = sections.map((s, i) =>
    i === idx
      ? {
          ...s,
          paragraphs: [
            { id: existing.paragraphs?.[0]?.id ?? "p-1", html: textToHtml(String(args.text)) },
          ],
        }
      : s
  );

  const res = await callSelf(input.req, "PATCH", `/api/v1/reports/${reportId}`, {
    sections: updated,
  });
  return toResult(res, "Report section updated.");
}

// ---- helpers ----

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface SelfResponse {
  status: number;
  json: unknown;
}

/**
 * The public origin of this deployment. Prefers the forwarded host/proto set by
 * a proxy (Railway, etc.) so the self-call reaches the same origin the browser
 * used; falls back to the request URL for local development.
 */
function selfOrigin(req: Request): string {
  const host = req.headers.get("host");
  if (host) {
    const proto =
      req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
    return `${proto}://${host}`;
  }
  return new URL(req.url).origin;
}

/**
 * Calls another route on this same server, forwarding the incoming request's
 * cookies so the target route authenticates as the same teacher.
 */
async function callSelf(
  req: Request,
  method: string,
  path: string,
  body: unknown
): Promise<SelfResponse> {
  const origin = selfOrigin(req);
  const cookie = req.headers.get("cookie") ?? "";
  const res = await fetch(`${origin}${path}`, {
    method,
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function ok2xx(res: SelfResponse): boolean {
  return res.status >= 200 && res.status < 300;
}

function firstError(res: SelfResponse): string {
  return res.json && typeof res.json === "object" && "error" in res.json
    ? String((res.json as { error: unknown }).error)
    : `request failed (${res.status})`;
}

function toResult(res: SelfResponse, successMessage: string): AgentApplyResult {
  return ok2xx(res)
    ? { ok: true, message: successMessage }
    : { ok: false, message: firstError(res) };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Runs `fn` over items with bounded concurrency, preserving order. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Folds many sub-call responses into one teacher-facing result (partial-aware). */
function combine(
  subcalls: Array<{ res: SelfResponse; count: number }>,
  noun: string,
  verb: string
): AgentApplyResult {
  const total = subcalls.reduce((n, s) => n + s.count, 0);
  const okCount = subcalls.filter((s) => ok2xx(s.res)).reduce((n, s) => n + s.count, 0);
  const failed = subcalls.find((s) => !ok2xx(s.res));
  const label = `${noun}${total === 1 ? "" : "s"}`;
  if (!failed) return { ok: true, message: `${verb} ${total} ${label}.` };
  return {
    ok: false,
    message:
      okCount > 0
        ? `${verb} ${okCount} of ${total} ${label}; the rest failed: ${firstError(failed.res)}`
        : `Couldn't save: ${firstError(failed.res)}`,
  };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Plain text → the report editor's paragraph HTML shape (one <p> per block). */
function textToHtml(text: string): string {
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length === 0) return "<p></p>";
  return blocks.map((b) => `<p>${escapeHtml(b).replace(/\n/g, "<br>")}</p>`).join("");
}
