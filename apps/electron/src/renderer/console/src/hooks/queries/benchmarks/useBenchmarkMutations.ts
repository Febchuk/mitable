import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  assignBenchmark,
  unassignBenchmark,
  updateBenchmark,
  updateAssignment,
  triggerCompute,
  createBenchmark,
  deleteBenchmark,
  updateBenchmarkParameters,
} from "../../../services/benchmarkService";
import type { BenchmarkFrequency, BenchmarkParameter, CreateBenchmarkPayload } from "../../../services/benchmarkService";

export function useAssignBenchmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      benchmarkId,
      userIds,
      targetOverride,
    }: {
      benchmarkId: string;
      userIds: string[];
      targetOverride?: number;
    }) => assignBenchmark(benchmarkId, userIds, targetOverride),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "benchmarks", variables.benchmarkId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "benchmarks"] });
    },
  });
}

export function useUnassignBenchmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ benchmarkId, userId }: { benchmarkId: string; userId: string }) =>
      unassignBenchmark(benchmarkId, userId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "benchmarks", variables.benchmarkId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "benchmarks"] });
    },
  });
}

export function useUpdateBenchmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: { name?: string; description?: string; targetValue?: number; frequency?: BenchmarkFrequency; isActive?: boolean };
    }) => updateBenchmark(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "benchmarks", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["admin", "benchmarks"] });
    },
  });
}

export function useUpdateAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      benchmarkId,
      userId,
      payload,
    }: {
      benchmarkId: string;
      userId: string;
      payload: { targetValue?: number };
    }) => updateAssignment(benchmarkId, userId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "benchmarks", variables.benchmarkId] });
    },
  });
}

export function useCreateBenchmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateBenchmarkPayload) => createBenchmark(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "benchmarks"] });
    },
  });
}

export function useDeleteBenchmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (benchmarkId: string) => deleteBenchmark(benchmarkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "benchmarks"] });
    },
  });
}

export function useTriggerCompute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (benchmarkId: string) => triggerCompute(benchmarkId),
    onSuccess: (_data, benchmarkId) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "benchmarks", benchmarkId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "benchmarks"] });
    },
  });
}

export function useUpdateBenchmarkParameters() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ benchmarkId, parameters }: { benchmarkId: string; parameters: BenchmarkParameter[] }) =>
      updateBenchmarkParameters(benchmarkId, parameters),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "benchmarks", variables.benchmarkId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "benchmarks"] });
    },
  });
}
