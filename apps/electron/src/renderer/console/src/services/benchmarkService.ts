import { apiRequest } from "./api";
import { createLogger } from "../../../lib/logger";

const logger = createLogger("BenchmarkService");

// ── Types ──────────────────────────────────────────────────

export type BenchmarkCategory = "productivity" | "collaboration" | "growth" | "quality";
export type BenchmarkPeriod = "weekly" | "monthly" | "quarterly";
export type TrendDirection = "improving" | "declining" | "stable" | "new";
export type PercentileTier = "top_1" | "top_10" | "top_25" | "top_50" | "bottom_half";

export interface Benchmark {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  category: BenchmarkCategory;
  metric: string;
  targetValue: number;
  unit: string;
  period: BenchmarkPeriod;
  isActive: boolean;
  assignedCount: number;
  avgProgress: number;
  trend: TrendDirection;
  trendDelta: number;
  createdAt: string;
  updatedAt: string;
}

export interface BenchmarkAssignment {
  id: string;
  benchmarkId: string;
  userId: string;
  userName: string;
  userEmail: string;
  userAvatarUrl: string | null;
  currentValue: number;
  targetValue: number;
  progress: number;
  percentile: PercentileTier;
  trend: TrendDirection;
  trendDelta: number;
  assignedAt: string;
}

export interface BenchmarkDetail extends Benchmark {
  assignments: BenchmarkAssignment[];
  teamAverage: number;
  improvingCount: number;
}

export interface BenchmarkSnapshot {
  date: string;
  value: number;
  target: number;
}

export interface AISuggestion {
  id: string;
  text: string;
  category: string;
}

export interface Accomplishment {
  id: string;
  text: string;
  date: string;
}

export interface MyBenchmark {
  id: string;
  benchmarkId: string;
  name: string;
  description: string;
  category: BenchmarkCategory;
  currentValue: number;
  targetValue: number;
  unit: string;
  progress: number;
  percentile: PercentileTier;
  trend: TrendDirection;
  trendDelta: number;
  period: BenchmarkPeriod;
  topAccomplishment: string | null;
}

export interface MyBenchmarkDetail extends MyBenchmark {
  history: BenchmarkSnapshot[];
  suggestions: AISuggestion[];
  accomplishments: Accomplishment[];
}

// ── Admin API ──────────────────────────────────────────────

export async function fetchBenchmarks(): Promise<Benchmark[]> {
  try {
    const response = await apiRequest<{ benchmarks: Benchmark[] }>("/admin/benchmarks");
    return response.benchmarks;
  } catch (error) {
    logger.error("Error fetching benchmarks:", error);
    throw error;
  }
}

export async function fetchBenchmarkDetail(id: string): Promise<BenchmarkDetail> {
  try {
    const response = await apiRequest<{ benchmark: BenchmarkDetail }>(`/admin/benchmarks/${id}`);
    return response.benchmark;
  } catch (error) {
    logger.error("Error fetching benchmark detail:", error);
    throw error;
  }
}

export async function updateBenchmark(
  id: string,
  payload: { targetValue?: number; period?: BenchmarkPeriod; isActive?: boolean }
): Promise<Benchmark> {
  try {
    const response = await apiRequest<{ benchmark: Benchmark }>(`/admin/benchmarks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return response.benchmark;
  } catch (error) {
    logger.error("Error updating benchmark:", error);
    throw error;
  }
}

export async function triggerCompute(id: string): Promise<void> {
  try {
    await apiRequest(`/admin/benchmarks/${id}/compute`, { method: "POST" });
  } catch (error) {
    logger.error("Error triggering compute:", error);
    throw error;
  }
}

export async function assignBenchmark(
  benchmarkId: string,
  userIds: string[],
  targetOverride?: number
): Promise<void> {
  try {
    await apiRequest(`/admin/benchmarks/${benchmarkId}/assign`, {
      method: "POST",
      body: JSON.stringify({ userIds, targetOverride }),
    });
  } catch (error) {
    logger.error("Error assigning benchmark:", error);
    throw error;
  }
}

export async function unassignBenchmark(benchmarkId: string, userId: string): Promise<void> {
  try {
    await apiRequest(`/admin/benchmarks/${benchmarkId}/unassign`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
  } catch (error) {
    logger.error("Error unassigning benchmark:", error);
    throw error;
  }
}

export async function updateAssignment(
  benchmarkId: string,
  userId: string,
  payload: { targetValue?: number }
): Promise<void> {
  try {
    await apiRequest(`/admin/benchmarks/${benchmarkId}/assignments/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  } catch (error) {
    logger.error("Error updating assignment:", error);
    throw error;
  }
}

export interface PersonBenchmarkDetail {
  benchmarkId: string;
  benchmarkName: string;
  benchmarkDescription: string;
  benchmarkCategory: BenchmarkCategory;
  userId: string;
  userName: string;
  userEmail: string;
  userAvatarUrl: string | null;
  currentValue: number;
  targetValue: number;
  unit: string;
  progress: number;
  percentile: PercentileTier;
  trend: TrendDirection;
  trendDelta: number;
  period: BenchmarkPeriod;
  history: BenchmarkSnapshot[];
  suggestions: AISuggestion[];
  accomplishments: Accomplishment[];
}

export async function fetchPersonBenchmarkDetail(
  benchmarkId: string,
  userId: string
): Promise<PersonBenchmarkDetail> {
  try {
    const response = await apiRequest<{ detail: PersonBenchmarkDetail }>(
      `/admin/benchmarks/${benchmarkId}/person/${userId}`
    );
    return response.detail;
  } catch (error) {
    logger.error("Error fetching person benchmark detail:", error);
    throw error;
  }
}

// ── Custom Benchmark Types ─────────────────────────────────

export interface BenchmarkAxis {
  id: string;
  name: string;
  description: string;
  importance: number; // 1-5 (user-facing)
}

export interface CreateBenchmarkPayload {
  name: string;
  description: string;
  category: BenchmarkCategory;
  period: BenchmarkPeriod;
  axes: BenchmarkAxis[];
}

// ── Custom Benchmark API ──────────────────────────────────

const MOCK_AXIS_TEMPLATES: Record<string, { name: string; description: string }[]> = {
  code: [
    { name: "Code Quality", description: "Measures code review scores, test coverage, and adherence to coding standards" },
    { name: "Velocity", description: "Rate of feature delivery and story point completion" },
    { name: "Technical Debt", description: "Reduction of legacy code issues and maintenance burden" },
  ],
  communication: [
    { name: "Communication", description: "Frequency and clarity of updates shared with the team" },
    { name: "Responsiveness", description: "Timeliness of replies to messages and review requests" },
    { name: "Documentation", description: "Quality and completeness of written documentation" },
  ],
  leadership: [
    { name: "Initiative", description: "Proactive problem-solving and self-directed work" },
    { name: "Mentorship", description: "Time spent helping teammates grow and learn" },
    { name: "Decision Making", description: "Quality and timeliness of technical decisions" },
  ],
  default: [
    { name: "Output Quality", description: "Overall quality of work produced" },
    { name: "Collaboration", description: "Effectiveness of working with teammates" },
    { name: "Growth", description: "Progress in developing new skills and knowledge" },
    { name: "Reliability", description: "Consistency in meeting commitments and deadlines" },
  ],
};

export async function generateBenchmarkAxes(description: string): Promise<BenchmarkAxis[]> {
  try {
    const response = await apiRequest<{ axes: BenchmarkAxis[] }>("/admin/benchmarks/generate-axes", {
      method: "POST",
      body: JSON.stringify({ description }),
    });
    return response.axes;
  } catch {
    // Mock fallback: keyword-based axis generation
    logger.info("Using mock axis generation (backend not available)");
    await new Promise((r) => setTimeout(r, 500));

    const lower = description.toLowerCase();
    let templates = MOCK_AXIS_TEMPLATES.default;
    if (lower.includes("code") || lower.includes("engineer") || lower.includes("development")) {
      templates = MOCK_AXIS_TEMPLATES.code;
    } else if (lower.includes("communicat") || lower.includes("writing") || lower.includes("update")) {
      templates = MOCK_AXIS_TEMPLATES.communication;
    } else if (lower.includes("lead") || lower.includes("manag") || lower.includes("senior")) {
      templates = MOCK_AXIS_TEMPLATES.leadership;
    }

    return templates.map((t, i) => ({
      id: `ax-${Date.now()}-${i}`,
      name: t.name,
      description: t.description,
      importance: 3,
    }));
  }
}

export async function createBenchmark(payload: CreateBenchmarkPayload): Promise<Benchmark> {
  try {
    const response = await apiRequest<{ benchmark: Benchmark }>("/admin/benchmarks", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return response.benchmark;
  } catch {
    // Mock fallback: return a fake benchmark
    logger.info("Using mock benchmark creation (backend not available)");
    const now = new Date().toISOString();
    return {
      id: `bm-${Date.now()}`,
      organizationId: "mock-org",
      name: payload.name,
      description: payload.description,
      category: payload.category,
      metric: "weighted_axes",
      targetValue: 100,
      unit: "score",
      period: payload.period,
      isActive: true,
      assignedCount: 0,
      avgProgress: 0,
      trend: "new",
      trendDelta: 0,
      createdAt: now,
      updatedAt: now,
    };
  }
}

// ── Employee API ───────────────────────────────────────────

export async function fetchMyBenchmarks(): Promise<MyBenchmark[]> {
  try {
    const response = await apiRequest<{ benchmarks: MyBenchmark[] }>("/my/benchmarks");
    return response.benchmarks;
  } catch (error) {
    logger.error("Error fetching my benchmarks:", error);
    throw error;
  }
}

export async function fetchMyBenchmarkDetail(id: string): Promise<MyBenchmarkDetail> {
  try {
    const response = await apiRequest<{ benchmark: MyBenchmarkDetail }>(`/my/benchmarks/${id}`);
    return response.benchmark;
  } catch (error) {
    logger.error("Error fetching my benchmark detail:", error);
    throw error;
  }
}

export async function fetchMyBenchmarkHistory(id: string): Promise<BenchmarkSnapshot[]> {
  try {
    const response = await apiRequest<{ history: BenchmarkSnapshot[] }>(
      `/my/benchmarks/${id}/history`
    );
    return response.history;
  } catch (error) {
    logger.error("Error fetching my benchmark history:", error);
    throw error;
  }
}
