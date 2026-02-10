import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchOrganizationSettings,
  updateOrganizationSettings,
  UpdateOrganizationSettingsPayload,
} from "../../../services/adminService";
import { useUser } from "../../../context/UserContext";

export function useOrganizationSettings() {
  const { user } = useUser();

  return useQuery({
    queryKey: ["admin", "organization", "settings"],
    queryFn: fetchOrganizationSettings,
    enabled: !!user && user.role === "admin",
  });
}

export function useUpdateOrganizationSettings() {
  const queryClient = useQueryClient();
  const { updateOrganization } = useUser();

  return useMutation({
    mutationFn: (payload: UpdateOrganizationSettingsPayload) => updateOrganizationSettings(payload),
    onSuccess: (data) => {
      // Invalidate the organization settings query
      queryClient.invalidateQueries({ queryKey: ["admin", "organization", "settings"] });

      // Update the organization in user context to immediately reflect the change
      updateOrganization({
        id: data.id,
        name: data.name,
        settings: data.settings,
      });
    },
  });
}
