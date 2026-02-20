import { useQuery } from "@tanstack/react-query";
import { fetchDashboardMetrics } from "../../../services/adminService";
import type { DashboardPeriod } from "../../../services/adminService";
import { useUser } from "../../../context/UserContext";

export function useDashboardMetrics(period: DashboardPeriod = "today") {
  const { user } = useUser();

  return useQuery({
    queryKey: ["admin", "dashboard", "metrics", period],
    queryFn: () => fetchDashboardMetrics(period),
    enabled: !!user && user.role === "admin",
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
  });
}
