/**
 * Classifier RLM Tools
 *
 * Tools for the batch classifier: peek at frames in slices, then commit
 * a classification when ready. Keeps context small for Phi-3.5.
 */

import type { RLMTool } from "./local-rlm-engine";
import type { ClassifierEnvironment } from "./classifier-rlm-environment";

const GET_BATCH_OVERVIEW: RLMTool<ClassifierEnvironment> = {
  name: "get_batch_overview",
  description:
    "Returns frame count, time range, and unique app names. Use first to understand the batch scope.",
  parameters: [],
  execute: (_params, env) => {
    const apps = new Set(env.frames.map((f) => f.appName).filter(Boolean));
    return {
      frameCount: env.frames.length,
      timeRange: env.timeRange,
      uniqueApps: [...apps],
      batchIndex: env.batchIndex,
    };
  },
};

const GET_FRAMES: RLMTool<ClassifierEnvironment> = {
  name: "get_frames",
  description:
    "Returns sensor outputs for a slice of frames. Peek at 5-10 at a time to build understanding.",
  parameters: [
    { name: "start", type: "number", required: true, description: "Start index (0-based)" },
    { name: "end", type: "number", required: true, description: "End index (exclusive)" },
  ],
  execute: (params, env) => {
    const start = Math.max(0, Number(params.start) || 0);
    const end = Math.min(env.frames.length, Number(params.end) || env.frames.length);
    return env.frames.slice(start, end).map((f) => ({
      index: f.index,
      time: f.time,
      app: f.appName,
      action: f.userAction,
      description: f.sensorOutput,
    }));
  },
};

const CLASSIFY: RLMTool<ClassifierEnvironment> = {
  name: "classify",
  description:
    "Commit the final classification for this batch. Call when you have enough context.",
  parameters: [
    { name: "description", type: "string", required: true, description: "2-3 sentence summary of activity" },
    { name: "activityType", type: "string", required: true, description: "coding|browsing|writing|communicating|designing|meeting|reading|other" },
    { name: "onTask", type: "boolean", required: true, description: "Whether user was productively on-task" },
    { name: "taskRelevance", type: "string", required: false, description: "Brief note on productivity relevance" },
    { name: "importanceScore", type: "number", required: true, description: "0.0 to 1.0 importance" },
  ],
  execute: (params, env) => {
    const result = {
      description: String(params.description || "Activity recorded"),
      activityType: String(params.activityType || "other"),
      onTask: Boolean(params.onTask),
      taskRelevance: params.taskRelevance ? String(params.taskRelevance) : null,
      importanceScore: Math.max(0, Math.min(1, Number(params.importanceScore) || 0.5)),
    };
    env.setClassification(result);
    return { stored: true, ...result };
  },
};

export const CLASSIFIER_TOOLS: RLMTool<ClassifierEnvironment>[] = [
  GET_BATCH_OVERVIEW,
  GET_FRAMES,
  CLASSIFY,
];
