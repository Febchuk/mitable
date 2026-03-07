// ── Existing base types ──

export type GraphFactType =
  | "top_task"
  | "top_app"
  | "workflow_pattern"
  | "app_behavior"
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

// ── Activity Resolution Pipeline types (§5-§8) ──

export type SourceType = "session_capture" | "workstream" | "workflow_interaction" | "persona_seed";

export type ActionType =
  | "typing"
  | "clicking"
  | "scrolling"
  | "viewing"
  | "navigating"
  | "unknown";

export interface ActivityEvent {
  eventId: string;
  occurredAt: string; // ISO 8601
  userId: string;
  orgId: string;
  sessionId: string;
  appName: string | null;
  windowTitle: string | null;
  activityDescription: string | null;
  actionType: ActionType | null;
  sourceType: SourceType;
  confidence: number; // 0-1
  metadata?: Record<string, unknown>;
}

export interface AppBehavior {
  appName: string;
  userId: string;
  orgId: string;
  topActivities: string[];
  behaviorStatement: string;
  evidenceCount: number;
  confidence: number;
}

export interface TaskArchetypeMapping {
  archetypeKey: string;
  displayName: string;
  domainKey: string;
  evidenceCount: number;
  confidence: number;
  sourceActivities: string[];
}

export interface WorkflowPatternResult {
  patternKey: string;
  displayName: string;
  taskChain: string[];
  supportCount: number;
  confidence: number;
  avgDurationMinutes: number;
}

export interface MapperPipelineResult {
  appBehaviors: AppBehavior[];
  archetypeMappings: TaskArchetypeMapping[];
  workflowPatterns: WorkflowPatternResult[];
  stats: {
    rawEventCount: number;
    afterDedupeCount: number;
    stageTimingsMs: Record<string, number>;
  };
}

// ── Scoring types ──

export interface EdgeWeightInput {
  oldWeight: number;
  daysSinceLastSeen: number;
  sourceReliability: number;
  confidence: number;
}

export interface EdgeWeightOutput {
  weight: number;
  decayApplied: number;
}

// ── Extended profile/result types ──

export interface AppBehaviorFact extends GraphFact {
  topActivities: string[];
}

export interface UserGraphProfileV2 extends UserGraphProfile {
  appBehaviors: AppBehaviorFact[];
}

export interface GraphSyncResultV2 extends GraphSyncResult {
  syncedAppBehaviors: number;
  syncedPatterns: number;
  pipelineStats?: MapperPipelineResult["stats"];
}
