import { useQuery } from "@tanstack/react-query";
import type { DashboardPeriod } from "../../services/adminService";
import {
  fetchMyActivity,
  fetchMyDrillDown,
  fetchMyCategoryActivities,
  fetchMySubscriberActivities,
} from "../../services/myActivityService";
import { useUser } from "../../context/UserContext";

export function useMyActivity(period: DashboardPeriod = "yesterday") {
  const { user } = useUser();
  return useQuery({
    queryKey: ["my-activity", period],
    queryFn: () => fetchMyActivity(period),
    enabled: !!user,
  });
}

export function useMyDrillDown(metric: string | null, period: DashboardPeriod = "yesterday") {
  const { user } = useUser();
  return useQuery({
    queryKey: ["my-activity", "drill-down", metric, period],
    queryFn: () => fetchMyDrillDown(metric!, period),
    enabled: !!user && !!metric,
  });
}

export function useMyCategoryActivities(category: string | null, period: DashboardPeriod = "all") {
  const { user } = useUser();
  return useQuery({
    queryKey: ["my-activity", "category-activities", category, period],
    queryFn: () => fetchMyCategoryActivities(category!, period),
    enabled: !!user && !!category,
  });
}

export function useMySubscriberActivities(
  subscriber: string | null,
  period: DashboardPeriod = "all"
) {
  const { user } = useUser();
  return useQuery({
    queryKey: ["my-activity", "subscriber-activities", subscriber, period],
    queryFn: () => fetchMySubscriberActivities(subscriber!, period),
    enabled: !!user && !!subscriber,
  });
}
