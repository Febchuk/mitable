import { useQuery } from "@tanstack/react-query";
import { fetchUsers } from "../../../services/adminService";
import { apiRequest } from "../../../services/api";
import { useUser } from "../../../context/UserContext";

interface UserListItem {
  id: string;
  name: string;
  email: string;
  role: string;
  jobTitle: string | null;
  status: string;
  avatarUrl: string | null;
  createdAt: string;
}

async function fetchMyReports(): Promise<UserListItem[]> {
  const response = await apiRequest<{ reports: UserListItem[] }>("/my-activity/reports?transitive=true");
  return response.reports;
}

export function useUsers() {
  const { user, viewMode } = useUser();

  const isAdmin = user?.role === "admin";
  const isManager = !!user?.isManager;

  return useQuery({
    queryKey: ["users", viewMode],
    queryFn: viewMode === "admin" ? fetchUsers : fetchMyReports,
    enabled: !!user && (viewMode === "admin" ? isAdmin : isManager),
  });
}
