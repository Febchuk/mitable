import { useQuery } from "@tanstack/react-query";
import { fetchMyBenchmarks } from "../../../services/benchmarkService";
import { useUser } from "../../../context/UserContext";
import { MOCK_MY_BENCHMARKS } from "./mockData";

export function useMyBenchmarks() {
  const { user } = useUser();

  return useQuery({
    queryKey: ["my-benchmarks"],
    queryFn: () => fetchMyBenchmarks().catch(() => MOCK_MY_BENCHMARKS),
    enabled: !!user,
  });
}
