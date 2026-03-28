import { useQuery } from "@tanstack/react-query";
import { fetchMyBenchmarkDetail } from "../../../services/benchmarkService";
import { useUser } from "../../../context/UserContext";
import { MOCK_MY_BENCHMARK_DETAILS } from "./mockData";

export function useMyBenchmarkDetail(id: string | undefined) {
  const { user } = useUser();

  return useQuery({
    queryKey: ["my-benchmarks", id],
    queryFn: () =>
      fetchMyBenchmarkDetail(id!).catch(() =>
        MOCK_MY_BENCHMARK_DETAILS[id!] ?? MOCK_MY_BENCHMARK_DETAILS["bm-deep-focus"]
      ),
    enabled: !!user && !!id,
  });
}
