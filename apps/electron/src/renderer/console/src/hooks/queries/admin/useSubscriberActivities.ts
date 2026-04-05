import { useQuery } from "@tanstack/react-query";
import { fetchSubscriberActivities } from "../../../services/adminService";
import type { DashboardPeriod } from "../../../services/adminService";
import { useUser } from "../../../context/UserContext";

export function useSubscriberActivities(
  userId: string,
  subscriber: string | null,
  period: DashboardPeriod = "all"
) {
  const { user } = useUser();

  return useQuery({
    queryKey: ["admin", "dashboard", "people", userId, "subscriber-activities", subscriber, period],
    queryFn: () => fetchSubscriberActivities(userId, subscriber!, period),
    enabled: !!user && (user.role === "admin" || !!user.isManager) && !!userId && !!subscriber,
  });
}
