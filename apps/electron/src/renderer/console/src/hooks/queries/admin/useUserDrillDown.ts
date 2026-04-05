import { useQuery } from "@tanstack/react-query";
import { fetchUserDrillDown } from "../../../services/adminService";
import type { DashboardPeriod } from "../../../services/adminService";
import { useUser } from "../../../context/UserContext";

export function useUserDrillDown(
  userId: string,
  metric: string | null,
  period: DashboardPeriod = "yesterday"
) {
  const { user } = useUser();

  return useQuery({
    queryKey: ["admin", "dashboard", "people", userId, "drill-down", metric, period],
    queryFn: () => fetchUserDrillDown(userId, metric!, period),
    enabled: !!user && (user.role === "admin" || !!user.isManager) && !!userId && !!metric,
  });
}
