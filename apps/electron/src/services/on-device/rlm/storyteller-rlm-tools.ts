/**
 * Storyteller RLM Tools
 *
 * Three tools for reading block.md content. No sub-LLM calls — the
 * storyteller reads the data directly and synthesizes the summary itself.
 */

import type { RLMTool } from "./local-rlm-engine";
import type { StorytellerEnvironment } from "./storyteller-rlm-environment";

const GET_BLOCK_OVERVIEW: RLMTool<StorytellerEnvironment> = {
  name: "get_block_overview",
  description:
    "Returns block.md stats: total lines, character count, number of image batches, apps used, session duration, transcript count.",
  parameters: [],
  execute: (_params, env) => env.metadata,
};

const READ_BLOCK: RLMTool<StorytellerEnvironment> = {
  name: "read_block",
  description:
    "Read a range of lines from block.md. Use get_block_overview first to know the total lines, then read in chunks.",
  parameters: [
    {
      name: "startLine",
      type: "number",
      required: true,
      description: "First line to read (1-based)",
    },
    {
      name: "endLine",
      type: "number",
      required: true,
      description: "Last line to read (inclusive)",
    },
  ],
  execute: (params, env) => {
    const start = Math.max(1, Number(params.startLine) || 1);
    const end = Math.min(env.lines.length, Number(params.endLine) || env.lines.length);
    const slice = env.lines.slice(start - 1, end);
    return {
      startLine: start,
      endLine: end,
      lineCount: slice.length,
      content: slice.join("\n"),
    };
  },
};

const GET_TRANSCRIPTS: RLMTool<StorytellerEnvironment> = {
  name: "get_transcripts",
  description:
    "Returns audio transcript lines from block.md. Optionally filter by line range. Each entry has lineNumber and text.",
  parameters: [
    {
      name: "startLine",
      type: "number",
      required: false,
      description: "Only return transcripts at or after this line (1-based)",
    },
    {
      name: "endLine",
      type: "number",
      required: false,
      description: "Only return transcripts at or before this line",
    },
  ],
  execute: (params, env) => {
    let transcripts = env.transcriptLines;

    const start = Number(params.startLine) || 0;
    const end = Number(params.endLine) || Infinity;

    if (start > 0 || end < Infinity) {
      transcripts = transcripts.filter((t) => t.lineNumber >= start && t.lineNumber <= end);
    }

    return {
      totalTranscripts: env.transcriptLines.length,
      returnedCount: transcripts.length,
      transcripts: transcripts.map((t) => ({ line: t.lineNumber, text: t.text })),
    };
  },
};

export const STORYTELLER_TOOLS: RLMTool<StorytellerEnvironment>[] = [
  GET_BLOCK_OVERVIEW,
  READ_BLOCK,
  GET_TRANSCRIPTS,
];
