import { useQuery } from "@tanstack/react-query";
import { fetchBenchmarkDetail } from "../../../services/benchmarkService";
import { useUser } from "../../../context/UserContext";
import { MOCK_BENCHMARK_DETAILS } from "./mockData";

export function useBenchmarkDetail(id: string | undefined) {
  const { user } = useUser();

  return useQuery({
    queryKey: ["admin", "benchmarks", id],
    queryFn: () =>
      fetchBenchmarkDetail(id!).catch(() =>
        MOCK_BENCHMARK_DETAILS[id!] ?? MOCK_BENCHMARK_DETAILS["bm-deep-focus"]
      ),
    enabled: !!user && user.role === "admin" && !!id,
  });
}
