/**
 * @deprecated Admin/Team views no longer in use in the desktop app.
 * Admin experience moves to the web app. Scheduled for migration.
 */
import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Users, ChevronRight, Pencil, Trash2, AlertCircle } from "lucide-react";
import { apiRequest } from "@/console/src/services/api";
import { createLogger } from "../../../../../../lib/logger";
import { useUser } from "@/console/src/context/UserContext";

const logger = createLogger("TeamsView");

// ─── Types ────────────────────────────────────────────────────────────────────

interface Team {
  id: string;
  name: string;
  description: string | null;
  leaderId: string | null;
  leaderName: string | null;
  parentTeamId: string | null;
  parentTeamName: string | null;
  organizationId: string;
  memberCount: number;
  subTeams: SubTeamSummary[];
  createdAt: string;
  updatedAt: string;
}

interface SubTeamSummary {
  id: string;
  name: string;
  memberCount: number;
}

interface CreateTeamPayload {
  name: string;
  description?: string;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchTeams(): Promise<Team[]> {
  try {
    const response = await apiRequest<{ teams: Team[] }>("/admin/teams");
    return response.teams;
  } catch (error) {
    logger.error("Error fetching teams:", error);
    throw error;
  }
}

async function createTeam(payload: CreateTeamPayload): Promise<Team> {
  try {
    const response = await apiRequest<{ team: Team }>("/admin/teams", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return response.team;
  } catch (error) {
    logger.error("Error creating team:", error);
    throw error;
  }
}

async function deleteTeam(teamId: string): Promise<void> {
  try {
    await apiRequest<void>(`/admin/teams/${teamId}`, {
      method: "DELETE",
    });
  } catch (error) {
    logger.error("Error deleting team:", error);
    throw error;
  }
}

async function updateTeam(teamId: string, payload: Partial<CreateTeamPayload>): Promise<Team> {
  try {
    const response = await apiRequest<{ team: Team }>(`/admin/teams/${teamId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return response.team;
  } catch (error) {
    logger.error("Error updating team:", error);
    throw error;
  }
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useTeams() {
  const { user } = useUser();

  return useQuery({
    queryKey: ["admin", "teams"],
    queryFn: fetchTeams,
    enabled: !!user && user.role === "admin",
  });
}

function useCreateTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateTeamPayload) => createTeam(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "teams"] });
    },
  });
}

function useDeleteTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (teamId: string) => deleteTeam(teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "teams"] });
    },
  });
}

function useUpdateTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ teamId, payload }: { teamId: string; payload: Partial<CreateTeamPayload> }) =>
      updateTeam(teamId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "teams"] });
    },
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function TeamCard({
  team,
  onEdit,
  onDelete,
}: {
  team: Team;
  onEdit: (team: Team) => void;
  onDelete: (team: Team) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "var(--bg-raised)",
        border: hovered ? "var(--border-subtle)" : "var(--border-hairline)",
        borderRadius: 12,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        transition: "border-color 0.15s ease",
      }}
    >
      {/* Card header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "rgba(var(--mi-accent-rgb, 130,192,204), 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Users size={16} style={{ color: "var(--mi-accent)" }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--text-primary)",
                lineHeight: 1.3,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {team.name}
            </div>
            {team.parentTeamName ? (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                  marginTop: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                <ChevronRight size={10} />
                {team.parentTeamName}
              </div>
            ) : null}
          </div>
        </div>

        {/* Action buttons — always reserve space to avoid layout shift */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            flexShrink: 0,
            opacity: hovered ? 1 : 0,
            transition: "opacity 0.15s ease",
            pointerEvents: hovered ? "auto" : "none",
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(team);
            }}
            aria-label={`Edit ${team.name}`}
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              border: "var(--border-subtle)",
              background: "var(--bg-overlay)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(team);
            }}
            aria-label={`Delete ${team.name}`}
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              border: "0.5px solid rgba(var(--status-error-rgb, 220,38,38), 0.18)",
              background: "rgba(var(--status-error-rgb, 220,38,38), 0.05)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--status-error)",
              cursor: "pointer",
            }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Description */}
      {team.description ? (
        <p
          style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            lineHeight: 1.55,
            margin: 0,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {team.description}
        </p>
      ) : null}

      {/* Meta row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          paddingTop: 12,
          borderTop: "var(--border-hairline)",
        }}
      >
        {/* Member count */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 12,
            color: "var(--text-tertiary)",
          }}
        >
          <Users size={12} />
          <span>
            {team.memberCount} {team.memberCount === 1 ? "member" : "members"}
          </span>
        </div>

        {/* Leader */}
        {team.leaderName ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: "rgba(var(--ui-rgb), 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                fontWeight: 600,
                color: "var(--text-secondary)",
                flexShrink: 0,
              }}
            >
              {getInitials(team.leaderName)}
            </div>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{team.leaderName}</span>
          </div>
        ) : null}
      </div>

      {/* Sub-teams */}
      {team.subTeams && team.subTeams.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Sub-teams
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {team.subTeams.map((sub) => (
              <span
                key={sub.id}
                style={{
                  fontSize: 11,
                  color: "var(--text-secondary)",
                  background: "rgba(var(--ui-rgb), 0.06)",
                  border: "var(--border-hairline)",
                  borderRadius: 5,
                  padding: "3px 8px",
                  whiteSpace: "nowrap",
                }}
              >
                {sub.name}
                {sub.memberCount > 0 ? (
                  <span style={{ color: "var(--text-tertiary)", marginLeft: 4 }}>
                    {sub.memberCount}
                  </span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Create / Edit Modal ──────────────────────────────────────────────────────

interface TeamFormValues {
  name: string;
  description: string;
}

function TeamFormModal({
  open,
  mode,
  initialValues,
  onClose,
  onSubmit,
  submitting,
  submitError,
}: {
  open: boolean;
  mode: "create" | "edit";
  initialValues?: TeamFormValues;
  onClose: () => void;
  onSubmit: (values: TeamFormValues) => void;
  submitting: boolean;
  submitError: string | null;
}) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [description, setDescription] = useState(initialValues?.description ?? "");
  const [nameError, setNameError] = useState<string | null>(null);

  // Sync form when initialValues change (edit mode)
  const prevOpen = useState(open)[0];
  if (open && !prevOpen) {
    // Modal just opened — reset to initialValues (handled via key on modal body)
  }

  const handleSubmit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError("Team name is required.");
      return;
    }
    setNameError(null);
    onSubmit({ name: trimmedName, description: description.trim() });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="team-modal-title"
      onKeyDown={handleKeyDown}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.45)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          margin: "0 16px",
          background: "var(--bg-overlay)",
          border: "var(--border-subtle)",
          borderRadius: 14,
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Modal header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 20px 16px",
            borderBottom: "var(--border-hairline)",
          }}
        >
          <h2
            id="team-modal-title"
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 20,
              fontWeight: 400,
              color: "var(--text-primary)",
              letterSpacing: "-0.2px",
              margin: 0,
            }}
          >
            {mode === "create" ? "Create team" : "Edit team"}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              border: "none",
              background: "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-tertiary)",
              cursor: "pointer",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal body */}
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Name field */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label
              htmlFor="team-name"
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Team name <span style={{ color: "var(--status-error)" }}>*</span>
            </label>
            <input
              id="team-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              placeholder="e.g. Engineering, Design, Growth"
              autoFocus
              style={{
                width: "100%",
                height: 40,
                padding: "0 12px",
                borderRadius: 8,
                border: nameError ? "0.5px solid var(--status-error)" : "var(--border-subtle)",
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            {nameError ? (
              <p style={{ fontSize: 12, color: "var(--status-error)", margin: 0 }}>{nameError}</p>
            ) : null}
          </div>

          {/* Description field */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label
              htmlFor="team-description"
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Description
            </label>
            <textarea
              id="team-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this team work on? (optional)"
              rows={3}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "var(--border-subtle)",
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                fontSize: 13,
                outline: "none",
                resize: "vertical",
                lineHeight: 1.5,
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Submit error */}
          {submitError ? (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "10px 12px",
                borderRadius: 8,
                background: "rgba(var(--status-error-rgb, 220,38,38), 0.06)",
                border: "0.5px solid rgba(var(--status-error-rgb, 220,38,38), 0.18)",
              }}
            >
              <AlertCircle
                size={14}
                style={{ color: "var(--status-error)", flexShrink: 0, marginTop: 1 }}
              />
              <p style={{ fontSize: 12, color: "var(--status-error)", margin: 0, lineHeight: 1.5 }}>
                {submitError}
              </p>
            </div>
          ) : null}
        </div>

        {/* Modal footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 8,
            padding: "12px 20px 16px",
            borderTop: "var(--border-hairline)",
          }}
        >
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              height: 34,
              padding: "0 14px",
              borderRadius: 8,
              border: "var(--border-subtle)",
              background: "transparent",
              color: "var(--text-primary)",
              fontSize: 13,
              cursor: submitting ? "default" : "pointer",
              opacity: submitting ? 0.6 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              height: 34,
              padding: "0 14px",
              borderRadius: 8,
              border: "0.5px solid var(--mi-accent-border)",
              background: "var(--mi-accent-bg)",
              color: "var(--text-primary)",
              fontSize: 13,
              fontWeight: 500,
              cursor: submitting ? "default" : "pointer",
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting
              ? mode === "create"
                ? "Creating..."
                : "Saving..."
              : mode === "create"
                ? "Create team"
                : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteConfirmModal({
  team,
  onClose,
  onConfirm,
  deleting,
  deleteError,
}: {
  team: Team | null;
  onClose: () => void;
  onConfirm: () => void;
  deleting: boolean;
  deleteError: string | null;
}) {
  if (!team) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.45)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          margin: "0 16px",
          background: "var(--bg-overlay)",
          border: "var(--border-subtle)",
          borderRadius: 14,
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "20px 20px 16px" }}>
          <h2
            id="delete-modal-title"
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 18,
              fontWeight: 400,
              color: "var(--text-primary)",
              letterSpacing: "-0.2px",
              margin: "0 0 8px",
            }}
          >
            Delete {team.name}?
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.55 }}>
            This will permanently delete the team and remove all member assignments. This action
            cannot be undone.
          </p>

          {deleteError ? (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 8,
                background: "rgba(var(--status-error-rgb, 220,38,38), 0.06)",
                border: "0.5px solid rgba(var(--status-error-rgb, 220,38,38), 0.18)",
              }}
            >
              <AlertCircle
                size={14}
                style={{ color: "var(--status-error)", flexShrink: 0, marginTop: 1 }}
              />
              <p style={{ fontSize: 12, color: "var(--status-error)", margin: 0, lineHeight: 1.5 }}>
                {deleteError}
              </p>
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 8,
            padding: "12px 20px 16px",
            borderTop: "var(--border-hairline)",
          }}
        >
          <button
            onClick={onClose}
            disabled={deleting}
            style={{
              height: 34,
              padding: "0 14px",
              borderRadius: 8,
              border: "var(--border-subtle)",
              background: "transparent",
              color: "var(--text-primary)",
              fontSize: 13,
              cursor: deleting ? "default" : "pointer",
              opacity: deleting ? 0.6 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            style={{
              height: 34,
              padding: "0 14px",
              borderRadius: 8,
              border: "0.5px solid rgba(var(--status-error-rgb, 220,38,38), 0.3)",
              background: "rgba(var(--status-error-rgb, 220,38,38), 0.08)",
              color: "var(--status-error)",
              fontSize: 13,
              fontWeight: 500,
              cursor: deleting ? "default" : "pointer",
              opacity: deleting ? 0.6 : 1,
            }}
          >
            {deleting ? "Deleting..." : "Delete team"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

import TeamsViewSkeleton from "./TeamsViewSkeleton";

// ─── Main View ────────────────────────────────────────────────────────────────

export default function TeamsView() {
  const { data: teams = [], isLoading, error } = useTeams();
  const createTeamMutation = useCreateTeam();
  const deleteTeamMutation = useDeleteTeam();
  const updateTeamMutation = useUpdateTeam();

  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const [deletingTeam, setDeletingTeam] = useState<Team | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleOpenCreate = useCallback(() => {
    setCreateError(null);
    setCreateOpen(true);
  }, []);

  const handleCloseCreate = useCallback(() => {
    setCreateOpen(false);
    setCreateError(null);
  }, []);

  const handleCreate = useCallback(
    async (values: TeamFormValues) => {
      setCreateError(null);
      try {
        await createTeamMutation.mutateAsync({
          name: values.name,
          description: values.description || undefined,
        });
        setCreateOpen(false);
      } catch (err) {
        setCreateError(err instanceof Error ? err.message : "Failed to create team.");
      }
    },
    [createTeamMutation]
  );

  const handleOpenEdit = useCallback((team: Team) => {
    setEditError(null);
    setEditingTeam(team);
  }, []);

  const handleCloseEdit = useCallback(() => {
    setEditingTeam(null);
    setEditError(null);
  }, []);

  const handleEdit = useCallback(
    async (values: TeamFormValues) => {
      if (!editingTeam) return;
      setEditError(null);
      try {
        await updateTeamMutation.mutateAsync({
          teamId: editingTeam.id,
          payload: { name: values.name, description: values.description || undefined },
        });
        setEditingTeam(null);
      } catch (err) {
        setEditError(err instanceof Error ? err.message : "Failed to update team.");
      }
    },
    [editingTeam, updateTeamMutation]
  );

  const handleOpenDelete = useCallback((team: Team) => {
    setDeleteError(null);
    setDeletingTeam(team);
  }, []);

  const handleCloseDelete = useCallback(() => {
    setDeletingTeam(null);
    setDeleteError(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingTeam) return;
    setDeleteError(null);
    try {
      await deleteTeamMutation.mutateAsync(deletingTeam.id);
      setDeletingTeam(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete team.");
    }
  }, [deletingTeam, deleteTeamMutation]);

  const countLabel = isLoading
    ? "Loading teams..."
    : `${teams.length} ${teams.length === 1 ? "team" : "teams"}`;

  return (
    <>
      {/* Create modal */}
      <TeamFormModal
        key={createOpen ? "create-open" : "create-closed"}
        open={createOpen}
        mode="create"
        onClose={handleCloseCreate}
        onSubmit={handleCreate}
        submitting={createTeamMutation.isPending}
        submitError={createError}
      />

      {/* Edit modal */}
      <TeamFormModal
        key={editingTeam ? `edit-${editingTeam.id}` : "edit-closed"}
        open={!!editingTeam}
        mode="edit"
        initialValues={
          editingTeam
            ? { name: editingTeam.name, description: editingTeam.description ?? "" }
            : undefined
        }
        onClose={handleCloseEdit}
        onSubmit={handleEdit}
        submitting={updateTeamMutation.isPending}
        submitError={editError}
      />

      {/* Delete confirm modal */}
      <DeleteConfirmModal
        team={deletingTeam}
        onClose={handleCloseDelete}
        onConfirm={handleConfirmDelete}
        deleting={deleteTeamMutation.isPending}
        deleteError={deleteError}
      />

      <div
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {/* Page header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 26,
                color: "var(--text-primary)",
                fontWeight: 400,
                letterSpacing: "-0.3px",
                margin: 0,
              }}
            >
              Teams
            </h1>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                marginTop: 8,
              }}
            >
              {countLabel}
            </div>
          </div>

          <button
            onClick={handleOpenCreate}
            style={{
              height: 34,
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "0 12px",
              borderRadius: 8,
              border: "0.5px solid var(--mi-accent-border)",
              background: "var(--mi-accent-bg)",
              color: "var(--text-primary)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Plus size={14} />
            Create team
          </button>
        </div>

        {/* Content */}
        {isLoading ? (
          <TeamsViewSkeleton />
        ) : error ? (
          <div
            style={{
              padding: "48px 0",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
            }}
          >
            <AlertCircle size={20} style={{ color: "var(--status-error)" }} />
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {error instanceof Error ? error.message : "Failed to load teams."}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              The teams endpoint may not be available yet.
            </div>
          </div>
        ) : teams.length === 0 ? (
          <div
            style={{
              padding: "64px 0",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "rgba(var(--ui-rgb), 0.05)",
                border: "var(--border-hairline)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 4,
              }}
            >
              <Users size={20} style={{ color: "var(--text-tertiary)" }} />
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
              No teams yet
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                maxWidth: 280,
                lineHeight: 1.5,
              }}
            >
              Create your first team to start organizing people across the organization.
            </div>
            <button
              onClick={handleOpenCreate}
              style={{
                marginTop: 8,
                height: 34,
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "0 14px",
                borderRadius: 8,
                border: "var(--border-subtle)",
                background: "var(--bg-raised)",
                color: "var(--text-primary)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <Plus size={14} />
              Create team
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 14,
            }}
          >
            {teams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                onEdit={handleOpenEdit}
                onDelete={handleOpenDelete}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
