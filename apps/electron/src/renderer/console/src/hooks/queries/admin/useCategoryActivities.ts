import { useQuery } from "@tanstack/react-query";
import { fetchCategoryActivities } from "../../../services/adminService";
import type { DashboardPeriod } from "../../../services/adminService";
import { useUser } from "../../../context/UserContext";

export function useCategoryActivities(
  userId: string,
  category: string | null,
  period: DashboardPeriod = "all"
) {
  const { user } = useUser();

  return useQuery({
    queryKey: ["admin", "dashboard", "people", userId, "category-activities", category, period],
    queryFn: () => fetchCategoryActivities(userId, category!, period),
    enabled: !!user && user.role === "admin" && !!userId && !!category,
  });
}
