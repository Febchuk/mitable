import type { SupabaseClient } from "@supabase/supabase-js";
import type { Content, GoogleGenAI, Part } from "@google/genai";
import { getGemini, GEMINI_MODEL } from "@/lib/gemini/client";
import {
  ARG_SCHEMAS,
  GRADE_READ_DECLARATIONS,
  GRADE_WRITE_DECLARATIONS,
  READ_FUNCTION_DECLARATIONS,
  WRITE_FUNCTION_DECLARATIONS,
  buildSystemPrompt,
  type TeacherAgentContext,
} from "./tools";
import {
  getReportDetail,
  listCurriculum,
  listGradeContext,
  listStudentReports,
} from "./read-tools";
import {
  WRITE_TOOLS,
  type AgentMessage,
  type AgentProposal,
  type AgentTurnResult,
  type WriteTool,
} from "./types";

const MAX_TURNS = 6;
const WRITE_TOOL_SET = new Set<string>(WRITE_TOOLS);

export interface RunTurnInput {
  admin: SupabaseClient;
  schoolId: string;
  classroomId: string;
  ctx: TeacherAgentContext;
  messages: AgentMessage[];
}

/**
 * One conversational turn. Read tools execute inline so the model can resolve
 * names, subtopics and reports; write tools never execute here — each valid one
 * becomes a proposal the teacher confirms. The loop ends when the model returns
 * plain text (its summary) or the turn budget is exhausted.
 */
export async function runTeacherAgentTurn(input: RunTurnInput): Promise<AgentTurnResult> {
  const ai = getGemini();
  const systemInstruction = buildSystemPrompt(input.ctx);
  const functionDeclarations = [
    ...READ_FUNCTION_DECLARATIONS,
    ...WRITE_FUNCTION_DECLARATIONS,
    ...(input.ctx.isElementary ? [...GRADE_READ_DECLARATIONS, ...GRADE_WRITE_DECLARATIONS] : []),
  ];

  // Human-readable labels for ids the model touches, so confirm cards read
  // naturally ("Amara Okafor", "Pink Tower") rather than showing raw UUIDs.
  const labels = new Map<string, string>();
  for (const s of input.ctx.roster) labels.set(s.id, s.name);

  const contents: Content[] = input.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const proposals: AgentProposal[] = [];
  const seenProposalKeys = new Set<string>();
  let reply = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await generateWithBackoff(ai, {
      model: GEMINI_MODEL,
      contents,
      config: {
        systemInstruction,
        temperature: 0.2,
        // High enough for the model to emit a large batch array (many marks /
        // students) in a single tool call without truncation.
        maxOutputTokens: 8192,
        tools: [{ functionDeclarations }],
      },
    });

    const candidate = response.candidates?.[0]?.content;
    const parts: Part[] = candidate?.parts ?? [];
    const calls = parts.filter(
      (p): p is Part & { functionCall: NonNullable<Part["functionCall"]> } =>
        Boolean(p.functionCall)
    );
    const text = parts
      .map((p) => p.text ?? "")
      .join("")
      .trim();

    if (calls.length === 0) {
      reply = text;
      break;
    }

    // Preserve the model turn verbatim so the functionResponse turn is valid.
    contents.push(candidate ?? { role: "model", parts });
    if (text) reply = text;

    const responseParts: Part[] = [];
    for (const call of calls) {
      const name = call.functionCall.name ?? "";
      const args = (call.functionCall.args ?? {}) as Record<string, unknown>;

      if (WRITE_TOOL_SET.has(name)) {
        const outcome = stageWriteProposal(
          name as WriteTool,
          args,
          labels,
          proposals,
          seenProposalKeys
        );
        responseParts.push({ functionResponse: { name, response: outcome } });
        continue;
      }

      try {
        const result = await executeReadTool(name, args, input, labels);
        responseParts.push({ functionResponse: { name, response: { result } } });
      } catch (err) {
        responseParts.push({
          functionResponse: {
            name,
            response: { error: err instanceof Error ? err.message : "Tool failed" },
          },
        });
      }
    }

    contents.push({ role: "user", parts: responseParts });
  }

  if (!reply) {
    reply =
      proposals.length > 0
        ? "Here's what I'll record — confirm below."
        : "I couldn't work out an action for that. Could you rephrase it?";
  }
  return { reply, proposals };
}

async function executeReadTool(
  name: string,
  args: Record<string, unknown>,
  input: RunTurnInput,
  labels: Map<string, string>
): Promise<unknown> {
  switch (name) {
    case "list_curriculum": {
      const topics = await listCurriculum(input.admin, input.classroomId);
      for (const t of topics) for (const s of t.subtopics) labels.set(s.id, s.name);
      return topics;
    }
    case "list_student_reports": {
      const rows = await listStudentReports(
        input.admin,
        input.schoolId,
        String(args.studentId ?? "")
      );
      for (const r of rows) labels.set(r.reportId, r.title);
      return rows;
    }
    case "get_report": {
      const report = await getReportDetail(
        input.admin,
        input.schoolId,
        String(args.reportId ?? "")
      );
      if (report) labels.set(report.reportId, report.title);
      return report ?? { error: "Report not found in this school." };
    }
    case "list_grade_context":
      return await listGradeContext(input.admin, input.schoolId, input.classroomId);
    default:
      throw new Error(`Unknown read tool: ${name}`);
  }
}

function stageWriteProposal(
  tool: WriteTool,
  rawArgs: Record<string, unknown>,
  labels: Map<string, string>,
  proposals: AgentProposal[],
  seen: Set<string>
): Record<string, unknown> {
  const parsed = ARG_SCHEMAS[tool].safeParse(rawArgs);
  if (!parsed.success) {
    return { error: `Invalid arguments: ${JSON.stringify(parsed.error.flatten().fieldErrors)}` };
  }
  const args = parsed.data as Record<string, unknown>;
  const key = `${tool}:${JSON.stringify(args)}`;
  if (seen.has(key)) {
    return { status: "already_pending", note: "This change is already awaiting confirmation." };
  }
  seen.add(key);
  proposals.push({
    id: crypto.randomUUID(),
    tool,
    args,
    summary: summarize(tool, args, labels),
  });
  return {
    status: "pending_confirmation",
    note: "Shown to the teacher as a confirmation card; it applies only after they tap Confirm. Do not call this tool again for the same change.",
  };
}

function nameFor(labels: Map<string, string>, id: unknown): string {
  return (typeof id === "string" && labels.get(id)) || "the selected item";
}

function summarize(
  tool: WriteTool,
  args: Record<string, unknown>,
  labels: Map<string, string>
): string {
  switch (tool) {
    case "mark_attendance": {
      const entries = (args.entries as Array<Record<string, unknown>>) ?? [];
      if (entries.length === 1) {
        const e = entries[0];
        const when = e.date ? ` on ${e.date}` : " today";
        return `Mark ${nameFor(labels, e.studentId)} ${e.status}${when}.`;
      }
      const present = entries.filter((e) => e.status === "present").length;
      return `Mark attendance for ${entries.length} students (${present} present, ${entries.length - present} absent).`;
    }
    case "record_progress": {
      const marks = (args.marks as Array<Record<string, unknown>>) ?? [];
      if (marks.length === 1) {
        const m = marks[0];
        return `Record ${nameFor(labels, m.studentId)}: ${nameFor(labels, m.subtopicId)} → ${m.status}.`;
      }
      const students = new Set(marks.map((m) => m.studentId)).size;
      const subtopics = new Set(marks.map((m) => m.subtopicId)).size;
      return `Record ${marks.length} progress marks (${students} student${students === 1 ? "" : "s"}, ${subtopics} subtopic${subtopics === 1 ? "" : "s"}).`;
    }
    case "add_observation": {
      const notes = (args.notes as Array<Record<string, unknown>>) ?? [];
      if (notes.length === 1) {
        return `Add observation for ${nameFor(labels, notes[0].studentId)}: "${notes[0].text}".`;
      }
      const students = new Set(notes.map((n) => n.studentId)).size;
      return `Add ${notes.length} observations across ${students} student${students === 1 ? "" : "s"}.`;
    }
    case "create_daily_report": {
      const ids = (args.studentIds as unknown[]) ?? [];
      if (ids.length === 1) {
        return `Create a draft daily report for ${nameFor(labels, ids[0])}.`;
      }
      return `Create ${ids.length} draft daily reports.`;
    }
    case "edit_report_section":
      return `Update the "${args.sectionHeading}" section of ${nameFor(labels, args.reportId)}.`;
    case "record_grade": {
      const grades = (args.grades as Array<Record<string, unknown>>) ?? [];
      if (grades.length === 1) {
        const g = grades[0];
        return `Record ${nameFor(labels, g.studentId)}: ${g.subject} · ${g.assessmentName} — ${g.percentage}% (${g.gradeLabel}).`;
      }
      const students = new Set(grades.map((g) => g.studentId)).size;
      return `Record ${grades.length} exam grades across ${students} student${students === 1 ? "" : "s"}.`;
    }
  }
}

type GenParams = Parameters<GoogleGenAI["models"]["generateContent"]>[0];
type GenResponse = Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>;

/**
 * Retries transient Gemini failures (429 rate limits, 5xx overloads) with
 * exponential backoff, so a burst of concurrent teacher requests degrades
 * gracefully instead of surfacing an error.
 */
async function generateWithBackoff(ai: GoogleGenAI, params: GenParams): Promise<GenResponse> {
  const MAX_ATTEMPTS = 4;
  let delayMs = 500;
  for (let attempt = 1; ; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS || !isRetryable(err)) throw err;
      await new Promise((resolve) =>
        setTimeout(resolve, delayMs + Math.floor(Math.random() * 250))
      );
      delayMs *= 2;
    }
  }
}

function isRetryable(err: unknown): boolean {
  const e = err as { status?: number; code?: number; message?: string };
  const status = e?.status ?? e?.code;
  if (status === 429 || status === 500 || status === 503) return true;
  return /\b(429|500|503)\b|rate limit|overloaded|unavailable|deadline/i.test(
    String(e?.message ?? "")
  );
}
