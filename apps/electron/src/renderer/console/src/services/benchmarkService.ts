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
