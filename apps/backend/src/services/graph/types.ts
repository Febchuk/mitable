export type GraphFactType =
  | "top_task"
  | "top_app"
  | "workflow_pattern"
  | "style_preference"
  | "domain_hint";

export interface GraphFact {
  factType: GraphFactType;
  subject: string;
  relation: string;
  object: string;
  score: number;
  evidenceCount: number;
  lastSeenAt?: string;
}

export interface UserGraphProfile {
  personKey: string;
  orgId: string;
  topTasks: GraphFact[];
  topApps: GraphFact[];
  patterns: GraphFact[];
  preferences: GraphFact[];
  domains: GraphFact[];
}

export interface GraphContextBlock {
  summaryFacts: string[];
  personalizationHints: string[];
  confidenceNotes: string[];
}

export interface GraphSyncResult {
  success: boolean;
  syncedUsers: number;
  syncedWorkstreams: number;
  syncedPreferences: number;
  durationMs: number;
  startedAt: string;
  finishedAt: string;
  error?: string;
}
