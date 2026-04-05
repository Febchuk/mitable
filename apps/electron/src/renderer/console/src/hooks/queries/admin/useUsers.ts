import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../../services/api";
import { useUser } from "../../../context/UserContext";
import type { DataScope } from "../../../types";

interface UserListItem {
  id: string;
  name: string;
  email: string;
  role: string;
  jobTitle: string | null;
  status: string;
  avatarUrl: string | null;
  createdAt: string;
  permissions?: string[];
}

async function fetchScopedUsers(scope: DataScope): Promise<UserListItem[]> {
  const response = await apiRequest<{ users: UserListItem[] }>(`/admin/users?scope=${scope}`);
  return response.users;
}

export function useUsers() {
  const { user, viewMode, dataScope } = useUser();

  const isAdmin = user?.role === "admin" || user?.originalRole === "admin";
  const isManager = !!user?.isManager;

  return useQuery({
    queryKey: ["users", viewMode, dataScope],
    queryFn: () => fetchScopedUsers(dataScope),
    enabled: !!user && viewMode === "manager" && (isAdmin || isManager),
  });
}
