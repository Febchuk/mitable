import { useQuery } from "@tanstack/react-query";
import { fetchBenchmarks } from "../../../services/benchmarkService";
import { useUser } from "../../../context/UserContext";

export function useBenchmarks() {
  const { user } = useUser();

  return useQuery({
    queryKey: ["admin", "benchmarks"],
    queryFn: () => fetchBenchmarks(),
    enabled: !!user && user.role === "admin",
  });
}
