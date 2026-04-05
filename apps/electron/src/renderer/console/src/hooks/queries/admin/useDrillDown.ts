import { useQuery } from "@tanstack/react-query";
import { fetchDrillDown } from "../../../services/adminService";
import type { DashboardPeriod } from "../../../services/adminService";
import { useUser } from "../../../context/UserContext";

export function useDrillDown(metric: string | null, period: DashboardPeriod = "yesterday") {
  const { user } = useUser();

  return useQuery({
    queryKey: ["admin", "dashboard", "drill-down", metric, period],
    queryFn: () => fetchDrillDown(metric!, period),
    enabled: !!user && (user.role === "admin" || !!user.isManager) && !!metric,
  });
}
