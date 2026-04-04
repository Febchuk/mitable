import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Check } from "lucide-react";
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
  const [visible, setVisible] = useState(false);

  const existingSet = useMemo(() => new Set(existingUserIds), [existingUserIds]);

  // Animate in/out
  useEffect(() => {
    if (open) {
      // Small delay so the DOM renders before we trigger the transition
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [open]);

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

    assignBenchmark(
      { benchmarkId, userIds },
      {
        onSuccess: () => {
          setSelectedIds(new Set());
          onOpenChange(false);
        },
      }
    );
  }

  function handleClose() {
    setSelectedIds(new Set());
    onOpenChange(false);
  }

  if (!open) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: "fixed",
          inset: 0,
          background: visible ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0)",
          transition: "background 0.25s ease",
          zIndex: 50,
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 400,
          maxWidth: "90vw",
          background: "var(--bg-raised)",
          borderLeft: "var(--border-hairline)",
          zIndex: 51,
          display: "flex",
          flexDirection: "column",
          transform: visible ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.25s ease",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "24px 24px 16px",
            borderBottom: "var(--border-hairline)",
            flexShrink: 0,
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 20,
              fontWeight: 400,
              color: "var(--text-primary)",
              letterSpacing: "-0.2px",
              margin: 0,
            }}
          >
            Assign People
          </h2>
          <button
            onClick={handleClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: "var(--text-tertiary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.1s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.04)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Description */}
        <div style={{ padding: "16px 24px 0", flexShrink: 0 }}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
            Select people to assign to this benchmark.
          </p>
        </div>

        {/* User list — scrollable */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 24px",
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
              <div
                key={user.id}
                onClick={() => toggleUser(user.id)}
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
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 5,
                    border: checked
                      ? "1.5px solid rgba(255,255,255,0.25)"
                      : "1.5px solid rgba(255,255,255,0.12)",
                    background: checked ? "rgba(255,255,255,0.1)" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    transition: "all 0.15s ease",
                    cursor: isExisting ? "default" : "pointer",
                  }}
                >
                  {checked && (
                    <Check size={12} style={{ color: "var(--text-primary)", strokeWidth: 2.5 }} />
                  )}
                </div>

                {/* Avatar */}
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "rgba(var(--ui-rgb), 0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    flexShrink: 0,
                  }}
                >
                  {getInitial(user.name)}
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
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "16px 24px 24px",
            flexShrink: 0,
          }}
        >
          <button
            onClick={handleClose}
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
            {isPending
              ? "Assigning..."
              : `Assign${selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}`}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
