/**
 * Workstream RLM Tools
 *
 * Predefined, safe tools for workstream detection and grouping.
 * The LLM pages through captures iteratively and builds up workstreams
 * instead of processing everything in one massive prompt.
 */

import { WorkstreamEnvironment } from "./workstream-environment.js";

export interface WorkstreamRLMToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "array";
  description: string;
  required: boolean;
}

export interface WorkstreamRLMTool {
  name: string;
  description: string;
  parameters: WorkstreamRLMToolParameter[];
  execute: (params: any, env: WorkstreamEnvironment) => any;
}

export const GET_SESSION_OVERVIEW: WorkstreamRLMTool = {
  name: "get_session_overview",
  description:
    "Get high-level session stats: capture count, time range, unique apps, page size. Call this FIRST to plan your analysis.",
  parameters: [],
  execute: (_params, env) => env.getOverview(),
};

export const GET_CAPTURES: WorkstreamRLMTool = {
  name: "get_captures",
  description:
    "Get a page of captures (max 25). Returns id, time, app, title, activity for each. Page through all captures to see them all.",
  parameters: [
    {
      name: "start",
      type: "number",
      description: "Start index (inclusive, 0-based)",
      required: true,
    },
    {
      name: "end",
      type: "number",
      description: "End index (exclusive). Max page size is 25.",
      required: true,
    },
  ],
  execute: (params, env) => env.getCaptures(params.start, params.end),
};

export const CREATE_WORKSTREAM: WorkstreamRLMTool = {
  name: "create_workstream",
  description: "Create a new workstream. Returns the workstream ID for use in assign_captures.",
  parameters: [
    {
      name: "name",
      type: "string",
      description: "Descriptive name for the workstream (e.g., 'JWT Auth Implementation')",
      required: true,
    },
    {
      name: "summary",
      type: "string",
      description: "Brief summary of what this workstream involves",
      required: true,
    },
    {
      name: "category",
      type: "string",
      description: "One of: development, communication, meeting, research, design, review, other",
      required: true,
    },
  ],
  execute: (params, env) => env.createWorkstream(params.name, params.summary, params.category),
};

export const ASSIGN_CAPTURES: WorkstreamRLMTool = {
  name: "assign_captures",
  description:
    "Assign one or more captures to a workstream by their IDs. You can assign in batches after viewing each page.",
  parameters: [
    {
      name: "workstreamId",
      type: "string",
      description: "The workstream ID to assign to",
      required: true,
    },
    {
      name: "captureIds",
      type: "array",
      description: "Array of capture IDs to assign",
      required: true,
    },
  ],
  execute: (params, env) => env.assignCaptures(params.workstreamId, params.captureIds),
};

export const UPDATE_WORKSTREAM: WorkstreamRLMTool = {
  name: "update_workstream",
  description: "Update an existing workstream's name, summary, or category.",
  parameters: [
    {
      name: "workstreamId",
      type: "string",
      description: "The workstream ID to update",
      required: true,
    },
    {
      name: "name",
      type: "string",
      description: "New name (optional)",
      required: false,
    },
    {
      name: "summary",
      type: "string",
      description: "New summary (optional)",
      required: false,
    },
    {
      name: "category",
      type: "string",
      description: "New category (optional)",
      required: false,
    },
  ],
  execute: (params, env) =>
    env.updateWorkstream(params.workstreamId, {
      name: params.name,
      summary: params.summary,
      category: params.category,
    }),
};

export const MERGE_WORKSTREAMS: WorkstreamRLMTool = {
  name: "merge_workstreams",
  description:
    "Merge one workstream into another. All captures from 'fromId' move to 'intoId'. Use after reviewing all captures to consolidate.",
  parameters: [
    {
      name: "fromId",
      type: "string",
      description: "Workstream ID to merge FROM (will be removed)",
      required: true,
    },
    {
      name: "intoId",
      type: "string",
      description: "Workstream ID to merge INTO (will absorb captures)",
      required: true,
    },
    {
      name: "reason",
      type: "string",
      description: "Brief reason for the merge",
      required: true,
    },
  ],
  execute: (params, env) => env.mergeWorkstreams(params.fromId, params.intoId, params.reason),
};

export const LIST_WORKSTREAMS: WorkstreamRLMTool = {
  name: "list_workstreams",
  description:
    "List all current workstreams with capture counts and apps. Use to review your groupings before finishing.",
  parameters: [],
  execute: (_params, env) => env.listWorkstreams(),
};

export const WORKSTREAM_RLM_TOOLS: WorkstreamRLMTool[] = [
  GET_SESSION_OVERVIEW,
  GET_CAPTURES,
  CREATE_WORKSTREAM,
  ASSIGN_CAPTURES,
  UPDATE_WORKSTREAM,
  MERGE_WORKSTREAMS,
  LIST_WORKSTREAMS,
];

export function getWorkstreamToolByName(name: string): WorkstreamRLMTool | undefined {
  return WORKSTREAM_RLM_TOOLS.find((tool) => tool.name === name);
}
