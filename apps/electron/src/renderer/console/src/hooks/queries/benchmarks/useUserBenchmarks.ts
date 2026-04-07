import { useQuery } from "@tanstack/react-query";
import { fetchUserBenchmarks } from "../../../services/benchmarkService";

export function useUserBenchmarks(userId: string | undefined) {
  return useQuery({
    queryKey: ["admin", "benchmarks", "user", userId],
    queryFn: () => fetchUserBenchmarks(userId!),
    enabled: !!userId,
  });
}
