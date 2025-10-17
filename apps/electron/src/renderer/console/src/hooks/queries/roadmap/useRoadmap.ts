import { useQuery } from "@tanstack/react-query";
import { fetchRoadmap } from "../../../services/roadmapService";
import { useUser } from "../../../context/UserContext";

export function useRoadmap() {
  const { user } = useUser();

  return useQuery({
    queryKey: ["roadmap", user?.id],
    queryFn: fetchRoadmap,
    enabled: !!user,
  });
}
