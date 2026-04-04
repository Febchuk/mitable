import { useQuery } from "@tanstack/react-query";
import { fetchUsers } from "../../../services/adminService";
import { useUser } from "../../../context/UserContext";

export function useUsers() {
  const { user, viewMode } = useUser();

  return useQuery({
    queryKey: ["admin", "users", viewMode],
    queryFn: fetchUsers,
    enabled: !!user && (user.role === "admin" || !!user.isManager),
  });
}
