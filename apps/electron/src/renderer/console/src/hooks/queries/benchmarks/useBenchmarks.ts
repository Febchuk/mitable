import { useQuery } from "@tanstack/react-query";
import { fetchBenchmarks } from "../../../services/benchmarkService";
import { useUser } from "../../../context/UserContext";
import { MOCK_BENCHMARKS } from "./mockData";

export function useBenchmarks() {
  const { user } = useUser();

  return useQuery({
    queryKey: ["admin", "benchmarks"],
    queryFn: () => fetchBenchmarks().catch(() => MOCK_BENCHMARKS),
    enabled: !!user && user.role === "admin",
  });
}
