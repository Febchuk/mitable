import { useQuery } from "@tanstack/react-query";
import { fetchMyBenchmarkDetail } from "../../../services/benchmarkService";
import { useUser } from "../../../context/UserContext";

export function useMyBenchmarkDetail(id: string | undefined) {
  const { user } = useUser();

  return useQuery({
    queryKey: ["my-benchmarks", id],
    queryFn: () => fetchMyBenchmarkDetail(id!),
    enabled: !!user && !!id,
  });
}
