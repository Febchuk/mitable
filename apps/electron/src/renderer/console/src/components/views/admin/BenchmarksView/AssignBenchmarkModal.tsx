import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUsers } from "@/console/src/hooks/queries/admin";
import { useAssignBenchmark } from "@/console/src/hooks/queries/benchmarks";

interface AssignBenchmarkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  benchmarkId: string;
  existingUserIds: string[];
}

function getInitial(name: string): string {
  return (name?.charAt(0) || "U").toUpperCase();
}

export function AssignBenchmarkModal({
  open,
  onOpenChange,
  benchmarkId,
  existingUserIds,
}: AssignBenchmarkModalProps) {
  const { data: users = [] } = useUsers();
  const { mutate: assignBenchmark, isPending } = useAssignBenchmark();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [targetOverride, setTargetOverride] = useState<string>("");

  const existingSet = useMemo(() => new Set(existingUserIds), [existingUserIds]);

  function toggleUser(userId: string) {
    if (existingSet.has(userId)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  function handleAssign() {
    const userIds = Array.from(selectedIds);
    if (!userIds.length) return;

    const payload: { benchmarkId: string; userIds: string[]; targetOverride?: number } = {
      benchmarkId,
      userIds,
    };

    const parsed = parseFloat(targetOverride);
    if (!isNaN(parsed) && targetOverride.trim() !== "") {
      payload.targetOverride = parsed;
    }

    assignBenchmark(payload, {
      onSuccess: () => {
        setSelectedIds(new Set());
        setTargetOverride("");
        onOpenChange(false);
      },
    });
  }

  function handleCancel() {
    setSelectedIds(new Set());
    setTargetOverride("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{
          background: "var(--bg-raised)",
          border: "var(--border-hairline)",
          borderRadius: 14,
          padding: 0,
          maxWidth: 460,
          width: "100%",
          overflow: "hidden",
        }}
      >
        <DialogHeader style={{ padding: "24px 24px 0" }}>
          <DialogTitle
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 20,
              fontWeight: 400,
              color: "var(--text-primary)",
              letterSpacing: "-0.2px",
            }}
          >
            Assign People
          </DialogTitle>
        </DialogHeader>

        <div style={{ padding: "16px 24px 0" }}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
            Select people to assign to this benchmark.
          </p>
        </div>

        {/* User list */}
        <div
          style={{
            maxHeight: 320,
            overflowY: "auto",
            margin: "16px 0 0",
            padding: "0 24px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {users.map((user) => {
            const isExisting = existingSet.has(user.id);
            const isSelected = selectedIds.has(user.id);
            const checked = isExisting || isSelected;

            return (
              <label
                key={user.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 8px",
                  borderRadius: 8,
                  cursor: isExisting ? "default" : "pointer",
                  opacity: isExisting ? 0.55 : 1,
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => {
                  if (!isExisting) {
                    e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={isExisting}
                  onChange={() => toggleUser(user.id)}
                  style={{
                    width: 15,
                    height: 15,
                    accentColor: "#82C0CC",
                    cursor: isExisting ? "default" : "pointer",
                    flexShrink: 0,
                  }}
                />

                {/* Avatar */}
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "var(--bg-base)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    flexShrink: 0,
                    overflow: "hidden",
                  }}
                >
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    getInitial(user.name)
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--text-primary)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {user.name}
                    {isExisting && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 10,
                          color: "var(--text-tertiary)",
                          fontWeight: 400,
                        }}
                      >
                        Already assigned
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-tertiary)",
                      marginTop: 2,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {user.email}
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        {/* Target override */}
        <div style={{ padding: "16px 24px 0" }}>
          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <span
              style={{
                fontSize: 10,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.09em",
                fontFamily: "var(--font-sans)",
              }}
            >
              Target Override (optional)
            </span>
            <input
              type="number"
              value={targetOverride}
              onChange={(e) => setTargetOverride(e.target.value)}
              placeholder="Use benchmark default"
              style={{
                width: "100%",
                height: 36,
                padding: "0 12px",
                borderRadius: 8,
                border: "var(--border-hairline)",
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </label>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "20px 24px 24px",
          }}
        >
          <button
            onClick={handleCancel}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 13,
              border: "var(--border-hairline)",
              background: "transparent",
              color: "var(--text-secondary)",
              cursor: "pointer",
              transition: "background 0.1s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.04)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={selectedIds.size === 0 || isPending}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 13,
              border: "none",
              background: selectedIds.size === 0 || isPending ? "rgba(130,192,204,0.4)" : "#82C0CC",
              color: "#1A1916",
              fontWeight: 500,
              cursor: selectedIds.size === 0 || isPending ? "not-allowed" : "pointer",
              transition: "background 0.1s, opacity 0.1s",
            }}
          >
            {isPending ? "Assigning..." : `Assign${selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
