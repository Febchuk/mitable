import { useQuery } from "@tanstack/react-query";
import { fetchBenchmarks } from "../../../services/benchmarkService";
import { useUser } from "../../../context/UserContext";

export function useBenchmarks() {
  const { user, viewMode, dataScope } = useUser();

  const isAdmin = user?.role === "admin" || user?.originalRole === "admin";
  const isManager = !!user?.isManager;

  return useQuery({
    queryKey: ["admin", "benchmarks", dataScope],
    queryFn: () => fetchBenchmarks(viewMode === "manager" ? dataScope : undefined),
    enabled: !!user && (isAdmin || isManager),
  });
}
