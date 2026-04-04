import { useQuery } from "@tanstack/react-query";
import { fetchSubscriberDrillDown } from "../../../services/adminService";
import type { DashboardPeriod } from "../../../services/adminService";
import { useUser } from "../../../context/UserContext";

export function useSubscriberDrillDown(
  subscriberName: string | null,
  period: DashboardPeriod = "yesterday"
) {
  const { user } = useUser();

  return useQuery({
    queryKey: ["admin", "dashboard", "drill-down", "subscriber", subscriberName, period],
    queryFn: () => fetchSubscriberDrillDown(subscriberName!, period),
    enabled: !!user && (user.role === "admin" || !!user.isManager) && !!subscriberName,
  });
}
