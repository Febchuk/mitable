import type Anthropic from "@anthropic-ai/sdk";
import { REPORT_SYSTEM_PROMPT, REPORT_TOOLS } from "@/lib/anthropic/report-tools";
import { DraftReportToolCall, type DraftReportToolCallT } from "@/lib/schemas/report";
import {
  mergeReferenceSets,
  type ReportDataAdapter,
  type ReportReferenceSet,
} from "@/lib/reports/data-adapter";
import { validateTokenPreservation } from "@/lib/reports/token-preservation";

/** Subset of the Anthropic SDK we use — lets tests pass a fake. */
export interface AnthropicLike {
  messages: {
    create: (args: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;
  };
}

export const MAX_AGENT_TURNS = 5;
export const MAX_REGENERATIONS = 2;

export interface AgentRunInput {
  studentToken: string;
  studentRef: string;
  classroomToken: string;
  classroomRef: string;
  reportType: "daily" | "major" | "incident";
  periodStart: string;
  periodEnd: string;
  adapter: ReportDataAdapter;
  anthropic: AnthropicLike;
  model: string;
  /** Voice/OCR text from the client (already tokenized). Optional. */
  captureTranscripts?: string[];
  captureNotes?: string[];
  /**
   * Seed tokens for the active student/classroom so token validation passes
   * even when the agent drafts from capture only (no read-tool calls).
   */
  seedReferences?: ReportReferenceSet;
  /**
   * Template sections (heading + guidance). The agent fills one prose block
   * per heading, in order. If empty, the agent will fall back to a single
   * "Report" section.
   */
  templateSections?: { heading: string; guidance: string }[];
  /** School tone / voice — included in the kickoff only (not sent as an image). */
  writingStyle?: string;
}

export interface AgentRunOutput {
  draft: DraftReportToolCallT["args"];
  references: ReportReferenceSet;
  turns: number;
  regenerations: number;
}

export class AgentAbortError extends Error {
  constructor(
    message: string,
    public readonly reason: "max_turns" | "no_draft" | "validation_failed" | "tool_error"
  ) {
    super(message);
  }
}

/**
 * Run the small Sonnet agent loop. Returns the validated draft tool call along
 * with the merged reference set the client uses to de-tokenize for display.
 *
 * Hard caps:
 *   - 5 tool turns total
 *   - 2 regenerations on token-preservation failure (then we surface the
 *     failure to the caller; see Phase 3 plan §6)
 */
export async function runReportAgent(input: AgentRunInput): Promise<AgentRunOutput> {
  const accumulatedRefs: ReportReferenceSet[] = [];
  if (input.seedReferences?.refs?.length) {
    accumulatedRefs.push(input.seedReferences);
  }
  let attempts = 0;

  while (attempts <= MAX_REGENERATIONS) {
    attempts++;
    const conv: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: buildKickoff(input),
          },
        ],
      },
    ];

    let turn = 0;
    let draftCall: DraftReportToolCallT["args"] | null = null;

    while (turn < MAX_AGENT_TURNS) {
      turn++;
      const resp = await input.anthropic.messages.create({
        model: input.model,
        max_tokens: 4096,
        system: REPORT_SYSTEM_PROMPT,
        tools: REPORT_TOOLS,
        messages: conv,
      });

      const toolUses = resp.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      if (toolUses.length === 0) {
        // No tool call this turn — agent is stalling. Push it to call draft_report.
        if (turn >= MAX_AGENT_TURNS) {
          throw new AgentAbortError("Agent produced no tool call", "no_draft");
        }
        conv.push({ role: "assistant", content: resp.content });
        conv.push({
          role: "user",
          content: [
            {
              type: "text",
              text: "Please call draft_report now with what you have.",
            },
          ],
        });
        continue;
      }

      // Process tool uses.
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUses) {
        if (block.name === "get_student_commands") {
          const args = block.input as { period_start: string; period_end: string };
          const data = await input.adapter.getStudentCommands({
            studentRef: input.studentRef,
            periodStart: args.period_start,
            periodEnd: args.period_end,
          });
          accumulatedRefs.push(data.references);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({ commands: data.commands }),
          });
        } else if (block.name === "get_student_progress_summary") {
          const data = await input.adapter.getStudentProgressSummary({
            studentRef: input.studentRef,
          });
          accumulatedRefs.push(data.references);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({ rows: data.rows }),
          });
        } else if (block.name === "draft_report") {
          const parsed = DraftReportToolCall.safeParse({
            tool: "draft_report",
            args: block.input,
          });
          if (!parsed.success) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              is_error: true,
              content: `Validation failed: ${JSON.stringify(parsed.error.flatten())}`,
            });
            continue;
          }
          draftCall = parsed.data.args;
        } else {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            is_error: true,
            content: `Unknown tool: ${block.name}`,
          });
        }
      }

      if (draftCall) {
        // Validate token preservation against the union of refs gathered so far.
        const merged = mergeReferenceSets(...accumulatedRefs);
        const concatenated = draftCall.sections
          .map((s) => `${s.heading}\n${s.content}`)
          .join("\n\n");
        const validation = validateTokenPreservation(
          `${draftCall.title}\n\n${concatenated}`,
          merged.refs
        );
        if (validation.ok) {
          return {
            draft: draftCall,
            references: merged,
            turns: turn,
            regenerations: attempts - 1,
          };
        }
        // Token preservation failed — bail out of this attempt and try again
        // from scratch with a stronger reminder.
        if (attempts > MAX_REGENERATIONS) {
          throw new AgentAbortError(
            `Token preservation failed after ${attempts} attempts: leaked=${validation.leakedNames.join(",")} unknown=${validation.unknownTokens.join(",")}`,
            "validation_failed"
          );
        }
        break; // restart outer attempt loop
      }

      conv.push({ role: "assistant", content: resp.content });
      conv.push({ role: "user", content: toolResults });
    }

    if (!draftCall) {
      if (attempts > MAX_REGENERATIONS) {
        throw new AgentAbortError(
          `Agent did not call draft_report within ${MAX_AGENT_TURNS} turns`,
          "max_turns"
        );
      }
      // restart attempt
    }
  }

  throw new AgentAbortError("Agent exhausted regeneration budget", "validation_failed");
}

function buildKickoff(input: AgentRunInput): string {
  const transcripts = (input.captureTranscripts ?? []).filter((t) => t.trim().length > 0);
  const notes = (input.captureNotes ?? []).filter((t) => t.trim().length > 0);
  const hasCapture = transcripts.length > 0 || notes.length > 0;
  const templateSections =
    input.templateSections && input.templateSections.length > 0
      ? input.templateSections
      : [{ heading: "Report", guidance: "A single prose summary of the period." }];

  const lines = [
    `Draft a ${input.reportType} report.`,
    `Student token: ${input.studentToken}`,
    `Classroom token: ${input.classroomToken}`,
    `Period: ${input.periodStart} → ${input.periodEnd}`,
    "",
  ];

  const tone = (input.writingStyle ?? "").trim();
  if (tone.length > 0) {
    lines.push("## Writing style (tone and voice for every section)");
    lines.push(tone);
    lines.push("");
  }

  lines.push(
    "## Sections to fill (in this exact order)",
    "Write one prose block per section. Match each heading verbatim. Follow each section's guidance.",
    ""
  );

  templateSections.forEach((s, i) => {
    const guidance = s.guidance?.trim().length ? s.guidance.trim() : "(no specific guidance)";
    lines.push(`${i + 1}. ${s.heading} — ${guidance}`);
  });
  lines.push("");

  if (hasCapture) {
    lines.push("## Teacher capture (primary narrative source)");
    lines.push("Ground the report content in this capture. Use tokens only — never real names.");
    if (transcripts.length > 0) {
      lines.push("", "Voice transcript(s):");
      transcripts.forEach((t, i) => lines.push(`${i + 1}. ${t}`));
    }
    if (notes.length > 0) {
      lines.push("", "Written notes / OCR:");
      notes.forEach((t, i) => lines.push(`${i + 1}. ${t}`));
    }
    lines.push(
      "",
      "Supplement with get_student_commands and get_student_progress_summary when they add structured facts for this period."
    );
  } else {
    lines.push("Use get_student_commands first, then get_student_progress_summary if you need it.");
  }

  lines.push(
    "",
    "Then call draft_report exactly once with a `sections` array — one entry per heading above, in order. Reference entities by token only."
  );
  return lines.join("\n");
}
