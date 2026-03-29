import { useQuery } from "@tanstack/react-query";
import { fetchPersonBenchmarkDetail } from "../../../services/benchmarkService";
import { getMockPersonBenchmarkDetail } from "./mockData";

export function usePersonBenchmarkDetail(benchmarkId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: ["admin", "benchmarks", benchmarkId, "person", userId],
    queryFn: () =>
      fetchPersonBenchmarkDetail(benchmarkId!, userId!).catch(
        () => getMockPersonBenchmarkDetail(benchmarkId!, userId!)
      ),
    enabled: !!benchmarkId && !!userId,
  });
}
