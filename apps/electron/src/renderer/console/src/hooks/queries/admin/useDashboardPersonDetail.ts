import { useQuery } from "@tanstack/react-query";
import { fetchDashboardPersonDetail } from "../../../services/adminService";
import type { DashboardPeriod } from "../../../services/adminService";
import { useUser } from "../../../context/UserContext";

export function useDashboardPersonDetail(userId: string, period: DashboardPeriod = "today") {
  const { user } = useUser();

  return useQuery({
    queryKey: ["admin", "dashboard", "person", userId, period],
    queryFn: () => fetchDashboardPersonDetail(userId, period),
    enabled: !!user && (user.role === "admin" || !!user.isManager) && !!userId,
  });
}
