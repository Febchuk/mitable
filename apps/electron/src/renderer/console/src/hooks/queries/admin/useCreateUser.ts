import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createUser, type CreateUserPayload } from "../../../services/adminService";

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateUserPayload) => createUser(payload),
    onSuccess: () => {
      // Invalidate users list to trigger refetch
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}
