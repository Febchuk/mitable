import { useQuery } from "@tanstack/react-query";
import { fetchDashboardPeople } from "../../../services/adminService";
import { useUser } from "../../../context/UserContext";

export function useDashboardPeople() {
  const { user, dataScope } = useUser();

  return useQuery({
    queryKey: ["admin", "dashboard", "people", dataScope],
    queryFn: () => fetchDashboardPeople(dataScope),
    enabled: !!user && (user.role === "admin" || !!user.isManager),
    refetchInterval: 5 * 60 * 1000,
  });
}
