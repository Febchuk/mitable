import { useQuery } from "@tanstack/react-query";
import { fetchBenchmarkDetail } from "../../../services/benchmarkService";
import { useUser } from "../../../context/UserContext";

export function useBenchmarkDetail(id: string | undefined) {
  const { user } = useUser();

  return useQuery({
    queryKey: ["admin", "benchmarks", id],
    queryFn: () => fetchBenchmarkDetail(id!),
    enabled: !!user && user.role === "admin" && !!id,
  });
}
