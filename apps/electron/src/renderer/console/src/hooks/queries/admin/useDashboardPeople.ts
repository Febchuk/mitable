import { useQuery } from "@tanstack/react-query";
import { fetchDashboardPeople } from "../../../services/adminService";
import type { DashboardPeriod } from "../../../services/adminService";
import { useUser } from "../../../context/UserContext";

export function useDashboardPeople(period: DashboardPeriod = "today") {
  const { user } = useUser();

  return useQuery({
    queryKey: ["admin", "dashboard", "people", period],
    queryFn: () => fetchDashboardPeople(period),
    enabled: !!user && user.role === "admin",
    refetchInterval: 5 * 60 * 1000,
  });
}
