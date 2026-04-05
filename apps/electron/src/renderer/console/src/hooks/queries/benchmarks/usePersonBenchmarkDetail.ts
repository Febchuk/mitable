import { useQuery } from "@tanstack/react-query";
import { fetchPersonBenchmarkDetail } from "../../../services/benchmarkService";

export function usePersonBenchmarkDetail(
  benchmarkId: string | undefined,
  userId: string | undefined
) {
  return useQuery({
    queryKey: ["admin", "benchmarks", benchmarkId, "person", userId],
    queryFn: () => fetchPersonBenchmarkDetail(benchmarkId!, userId!),
    enabled: !!benchmarkId && !!userId,
  });
}
