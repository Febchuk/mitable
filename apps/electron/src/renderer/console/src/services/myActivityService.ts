import { apiRequest } from "./api";
import type {
  DashboardPeriod,
  DashboardPersonDetail,
  DrillDownData,
  CategoryActivitiesResponse,
  SubscriberActivitiesResponse,
} from "./adminService";

export async function fetchMyActivity(
  period: DashboardPeriod = "yesterday"
): Promise<DashboardPersonDetail> {
  return apiRequest<DashboardPersonDetail>(`/my-activity?period=${period}`);
}

export async function fetchMyDrillDown(
  metric: string,
  period: DashboardPeriod = "yesterday"
): Promise<DrillDownData> {
  return apiRequest<DrillDownData>(
    `/my-activity/drill-down/${encodeURIComponent(metric)}?period=${period}`
  );
}

export async function fetchMyCategoryActivities(
  category: string,
  period: DashboardPeriod = "all"
): Promise<CategoryActivitiesResponse> {
  return apiRequest<CategoryActivitiesResponse>(
    `/my-activity/category-activities/${encodeURIComponent(category)}?period=${period}`
  );
}

export async function fetchMySubscriberActivities(
  subscriber: string,
  period: DashboardPeriod = "all"
): Promise<SubscriberActivitiesResponse> {
  return apiRequest<SubscriberActivitiesResponse>(
    `/my-activity/subscriber-activities/${encodeURIComponent(subscriber)}?period=${period}`
  );
}
