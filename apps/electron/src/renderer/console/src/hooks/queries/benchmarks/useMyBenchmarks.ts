import { useQuery } from "@tanstack/react-query";
import { fetchMyBenchmarks } from "../../../services/benchmarkService";
import { useUser } from "../../../context/UserContext";

export function useMyBenchmarks() {
  const { user } = useUser();

  return useQuery({
    queryKey: ["my-benchmarks"],
    queryFn: () => fetchMyBenchmarks(),
    enabled: !!user,
  });
}
