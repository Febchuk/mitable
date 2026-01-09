/**
 * Artifacts Query Hooks
 *
 * React Query hooks for artifacts (uploaded files and pasted text) functionality.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "../../../context/UserContext";
import * as artifactsService from "../../../services/artifactsService";
import type { CreateArtifactRequest } from "@mitable/shared";

// Query Keys
export const artifactsKeys = {
    all: ["artifacts"] as const,
    lists: () => [...artifactsKeys.all, "list"] as const,
};

// ===========================
// List Artifacts
// ===========================

export function useArtifacts() {
    const { user } = useUser();

    return useQuery({
        queryKey: artifactsKeys.lists(),
        queryFn: () => artifactsService.fetchArtifacts(),
        enabled: !!user,
    });
}

// ===========================
// Create Artifact
// ===========================

export function useCreateArtifact() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: CreateArtifactRequest) => artifactsService.createArtifact(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: artifactsKeys.lists() });
        },
    });
}

// ===========================
// Delete Artifact
// ===========================

export function useDeleteArtifact() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => artifactsService.deleteArtifact(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: artifactsKeys.lists() });
        },
    });
}
