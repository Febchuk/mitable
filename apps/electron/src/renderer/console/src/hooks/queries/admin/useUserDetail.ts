import { useQuery } from "@tanstack/react-query";
import { fetchUserDetail } from "../../../services/adminService";
import { useUser } from "../../../context/UserContext";

export function useUserDetail(userId: string) {
  const { user } = useUser();

  return useQuery({
    queryKey: ["admin", "users", userId],
    queryFn: () => fetchUserDetail(userId),
    enabled: !!user && user.role === "admin" && !!userId,
  });
}
