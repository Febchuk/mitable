import { useQuery } from "@tanstack/react-query";
import { fetchUsers } from "../../../services/adminService";
import { useUser } from "../../../context/UserContext";

export function useUsers() {
  const { user } = useUser();

  return useQuery({
    queryKey: ["admin", "users"],
    queryFn: fetchUsers,
    enabled: !!user && user.role === "admin", // Only fetch for admin users
  });
}
