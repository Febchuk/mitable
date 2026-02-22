import { useQuery } from "@tanstack/react-query";
import { fetchDashboardPeople } from "../../../services/adminService";
import { useUser } from "../../../context/UserContext";

export function useDashboardPeople() {
  const { user } = useUser();

  return useQuery({
    queryKey: ["admin", "dashboard", "people"],
    queryFn: fetchDashboardPeople,
    enabled: !!user && user.role === "admin",
    refetchInterval: 5 * 60 * 1000,
  });
}
