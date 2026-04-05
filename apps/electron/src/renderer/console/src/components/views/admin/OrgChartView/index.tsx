import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, ChevronRight, Users, AlertCircle, X } from "lucide-react";
import { API_BASE_URL } from "@/console/src/lib/config";
import { authService } from "@/console/src/services/authService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserNode {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: string;
  jobTitle: string | null;
  avatarUrl: string | null;
  managerId: string | null;
  teamId: string | null;
  department: string | null;
  status: "active" | "inactive" | string;
  directReports: UserNode[];
}

interface OrgTreeResponse {
  tree: UserNode[];
  totalUsers: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFullName(node: UserNode): string {
  const first = node.firstName ?? "";
  const last = node.lastName ?? "";
  const name = `${first} ${last}`.trim();
  return name || node.email;
}

function getInitial(node: UserNode): string {
  const name = getFullName(node);
  return name.charAt(0).toUpperCase();
}

/** Flatten tree into a plain array preserving manager name lookup. */
function flattenTree(nodes: UserNode[], managerMap: Map<string, UserNode>): UserNode[] {
  const result: UserNode[] = [];
  function walk(node: UserNode) {
    managerMap.set(node.id, node);
    result.push(node);
    for (const child of node.directReports) walk(child);
  }
  for (const node of nodes) walk(node);
  return result;
}

/** Returns true if the node or any of its descendants match the query. */
function nodeMatchesQuery(node: UserNode, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (
    getFullName(node).toLowerCase().includes(q) ||
    node.email.toLowerCase().includes(q) ||
    (node.jobTitle ?? "").toLowerCase().includes(q) ||
    (node.department ?? "").toLowerCase().includes(q)
  ) {
    return true;
  }
  return node.directReports.some((child) => nodeMatchesQuery(child, query));
}

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------

async function assignManager(userId: string, managerId: string | null): Promise<boolean> {
  const token = authService.getAccessToken();
  const res = await fetch(`${API_BASE_URL}/api/admin/users/${userId}/manager`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ managerId }),
  });
  return res.ok;
}

// ---------------------------------------------------------------------------
// Avatar circle
// ---------------------------------------------------------------------------

function Avatar({ node, size = 32 }: { node: UserNode; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "rgba(var(--ui-rgb), 0.12)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.375,
        fontWeight: 500,
        color: "var(--text-primary)",
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {getInitial(node)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ManagerDropdown — reusable searchable select for manager assignment
// ---------------------------------------------------------------------------

function ManagerDropdown({
  node,
  flatNodes,
  onManagerChanged,
}: {
  node: UserNode;
  flatNodes: UserNode[];
  onManagerChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
        setError(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Focus search input when opened
  useEffect(() => {
    if (open && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 30);
    }
  }, [open]);

  const candidates = useMemo(() => {
    const base = flatNodes.filter((n) => n.id !== node.id);
    if (!search) return base;
    const q = search.toLowerCase();
    return base.filter(
      (n) => getFullName(n).toLowerCase().includes(q) || n.email.toLowerCase().includes(q)
    );
  }, [flatNodes, node.id, search]);

  async function handleSelect(managerId: string | null) {
    setSaving(true);
    setError(null);
    const ok = await assignManager(node.id, managerId);
    setSaving(false);
    if (ok) {
      setOpen(false);
      setSearch("");
      onManagerChanged();
    } else {
      setError("Could not assign manager. Check for circular hierarchy.");
    }
  }

  const currentManagerId = node.managerId;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Trigger */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        disabled={saving}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "3px 8px",
          borderRadius: 5,
          border: "var(--border-subtle)",
          background: open ? "rgba(var(--ui-rgb), 0.07)" : "transparent",
          color: "var(--text-secondary)",
          fontSize: 12,
          fontFamily: "var(--font-sans)",
          cursor: saving ? "not-allowed" : "pointer",
          opacity: saving ? 0.6 : 1,
          transition: "background 0.1s",
          whiteSpace: "nowrap",
          maxWidth: 180,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        title="Change manager"
      >
        {saving ? (
          <InlineSpinner />
        ) : (
          <ChevronDown size={11} style={{ opacity: 0.6, flexShrink: 0 }} />
        )}
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {currentManagerId
            ? flatNodes.find((n) => n.id === currentManagerId)
              ? getFullName(flatNodes.find((n) => n.id === currentManagerId)!)
              : "Unknown"
            : "None"}
        </span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 9999,
            width: 240,
            background: "var(--bg-overlay)",
            border: "var(--border-subtle)",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            overflow: "hidden",
          }}
        >
          {/* Search input */}
          <div
            style={{
              padding: "8px 10px",
              borderBottom: "var(--border-hairline)",
              position: "relative",
            }}
          >
            <Search
              size={12}
              style={{
                position: "absolute",
                left: 19,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-tertiary)",
                pointerEvents: "none",
              }}
            />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              style={{
                width: "100%",
                height: 28,
                paddingLeft: 26,
                paddingRight: 8,
                borderRadius: 5,
                border: "var(--border-hairline)",
                background: "rgba(var(--ui-rgb), 0.05)",
                color: "var(--text-primary)",
                fontSize: 12,
                outline: "none",
                fontFamily: "var(--font-sans)",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Error message */}
          {error && (
            <div
              style={{
                padding: "7px 12px",
                fontSize: 11,
                color: "var(--status-error)",
                borderBottom: "var(--border-hairline)",
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <AlertCircle size={11} />
              {error}
            </div>
          )}

          {/* Option list */}
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {/* None option */}
            <DropdownOption
              label="None (top-level)"
              subLabel=""
              selected={currentManagerId === null}
              onSelect={() => handleSelect(null)}
            />
            {candidates.length === 0 ? (
              <div
                style={{
                  padding: "10px 12px",
                  fontSize: 12,
                  color: "var(--text-tertiary)",
                  textAlign: "center",
                }}
              >
                No matches
              </div>
            ) : (
              candidates.map((candidate) => (
                <DropdownOption
                  key={candidate.id}
                  label={getFullName(candidate)}
                  subLabel={candidate.jobTitle ?? candidate.email}
                  selected={currentManagerId === candidate.id}
                  onSelect={() => handleSelect(candidate.id)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DropdownOption({
  label,
  subLabel,
  selected,
  onSelect,
}: {
  label: string;
  subLabel: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "7px 12px",
        cursor: "pointer",
        background: selected
          ? "rgba(var(--ui-rgb), 0.08)"
          : hovered
            ? "rgba(var(--ui-rgb), 0.05)"
            : "transparent",
        borderLeft: selected ? "2px solid var(--mi-accent)" : "2px solid transparent",
        transition: "background 0.08s",
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: "var(--text-primary)",
          fontWeight: selected ? 500 : 400,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </div>
      {subLabel && (
        <div
          style={{
            fontSize: 11,
            color: "var(--text-tertiary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            marginTop: 1,
          }}
        >
          {subLabel}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline spinner (small, used inside buttons)
// ---------------------------------------------------------------------------

function InlineSpinner() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame: number;
    let angle = 0;
    function tick() {
      angle = (angle + 6) % 360;
      if (ref.current) ref.current.style.transform = `rotate(${angle}deg)`;
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      ref={ref}
      style={{
        width: 10,
        height: 10,
        borderRadius: "50%",
        border: "1.5px solid rgba(var(--ui-rgb), 0.15)",
        borderTopColor: "var(--mi-accent)",
        flexShrink: 0,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// NodeDetailPanel — slide-out panel shown when a tree node name is clicked
// ---------------------------------------------------------------------------

function NodeDetailPanel({
  node,
  flatNodes,
  managerMap,
  onClose,
  onManagerChanged,
}: {
  node: UserNode;
  flatNodes: UserNode[];
  managerMap: Map<string, UserNode>;
  onClose: () => void;
  onManagerChanged: () => void;
}) {
  const manager = node.managerId ? managerMap.get(node.managerId) : undefined;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 200,
          background: "transparent",
        }}
      />

      {/* Panel */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 320,
          zIndex: 201,
          background: "var(--bg-overlay)",
          borderLeft: "var(--border-subtle)",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.18)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Panel header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "var(--border-hairline)",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-primary)",
              fontFamily: "var(--font-sans)",
            }}
          >
            Person details
          </span>
          <button
            onClick={onClose}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 26,
              height: 26,
              borderRadius: 5,
              border: "none",
              background: "transparent",
              color: "var(--text-tertiary)",
              cursor: "pointer",
              padding: 0,
            }}
            title="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Panel body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {/* Identity */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginBottom: 20,
            }}
          >
            <Avatar node={node} size={48} />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-serif)",
                  lineHeight: 1.2,
                }}
              >
                {getFullName(node)}
              </div>
              {node.jobTitle && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    marginTop: 3,
                  }}
                >
                  {node.jobTitle}
                </div>
              )}
            </div>
          </div>

          {/* Detail rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <DetailRow label="Email" value={node.email} />
            {node.department && <DetailRow label="Department" value={node.department} />}

            {/* Reports to — editable */}
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  color: "var(--text-tertiary)",
                  marginBottom: 6,
                }}
              >
                Reports to
              </div>
              <ManagerDropdown
                node={node}
                flatNodes={flatNodes}
                onManagerChanged={() => {
                  onManagerChanged();
                }}
              />
            </div>

            {/* Direct reports list */}
            {node.directReports.length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.07em",
                    color: "var(--text-tertiary)",
                    marginBottom: 6,
                  }}
                >
                  Direct reports ({node.directReports.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {node.directReports.map((report) => (
                    <div
                      key={report.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 8px",
                        borderRadius: 6,
                        background: "rgba(var(--ui-rgb), 0.04)",
                      }}
                    >
                      <Avatar node={report} size={22} />
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--text-primary)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {getFullName(report)}
                        </div>
                        {report.jobTitle && (
                          <div
                            style={{
                              fontSize: 11,
                              color: "var(--text-tertiary)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {report.jobTitle}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {node.directReports.length === 0 && (
              <DetailRow
                label="Direct reports"
                value={manager ? `Reports to ${getFullName(manager)}, no direct reports` : "None"}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          color: "var(--text-tertiary)",
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--text-secondary)",
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tree node — recursive
// ---------------------------------------------------------------------------

function TreeNode({
  node,
  depth,
  searchQuery,
  defaultExpanded,
  flatNodes,
  managerMap,
  onManagerChanged,
}: {
  node: UserNode;
  depth: number;
  searchQuery: string;
  defaultExpanded: boolean;
  flatNodes: UserNode[];
  managerMap: Map<string, UserNode>;
  onManagerChanged: () => void;
}) {
  const hasReports = node.directReports.length > 0;
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [hovered, setHovered] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  // Auto-expand when a search query is active so matches are visible
  useEffect(() => {
    if (searchQuery) {
      setExpanded(true);
    }
  }, [searchQuery]);

  if (!nodeMatchesQuery(node, searchQuery)) return null;

  const fullName = getFullName(node);

  return (
    <div>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "9px 0",
          paddingLeft: depth * 28,
          borderBottom: "var(--border-hairline)",
          background: hovered ? "rgba(var(--ui-rgb), 0.025)" : "transparent",
          transition: "background 0.12s ease",
        }}
      >
        {/* Expand / collapse chevron — click target is only this element */}
        <div
          onClick={() => {
            if (hasReports) setExpanded((prev) => !prev);
          }}
          style={{
            width: 16,
            height: 16,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: hasReports ? "var(--text-secondary)" : "transparent",
            cursor: hasReports ? "pointer" : "default",
            borderRadius: 3,
          }}
        >
          {hasReports ? expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}
        </div>

        {/* Name / avatar area — clicking opens detail panel */}
        <div
          onClick={() => setPanelOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flex: 1,
            minWidth: 0,
            cursor: "pointer",
          }}
        >
          <Avatar node={node} size={32} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-primary)",
                lineHeight: 1.2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {fullName}
            </div>
            {node.jobTitle && (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                  marginTop: 3,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {node.jobTitle}
              </div>
            )}
          </div>

          {/* Direct reports badge */}
          {hasReports && (
            <div
              style={{
                flexShrink: 0,
                fontSize: 11,
                color: "var(--text-tertiary)",
                display: "flex",
                alignItems: "center",
                gap: 4,
                paddingRight: 4,
              }}
            >
              <Users size={11} style={{ opacity: 0.7 }} />
              {node.directReports.length}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {panelOpen && (
        <NodeDetailPanel
          node={node}
          flatNodes={flatNodes}
          managerMap={managerMap}
          onClose={() => setPanelOpen(false)}
          onManagerChanged={() => {
            setPanelOpen(false);
            onManagerChanged();
          }}
        />
      )}

      {/* Children */}
      {expanded && hasReports && (
        <div>
          {node.directReports.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              searchQuery={searchQuery}
              defaultExpanded={defaultExpanded}
              flatNodes={flatNodes}
              managerMap={managerMap}
              onManagerChanged={onManagerChanged}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading spinner
// ---------------------------------------------------------------------------

function Spinner() {
  const spinnerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame: number;
    let angle = 0;
    function tick() {
      angle = (angle + 4) % 360;
      if (spinnerRef.current) {
        spinnerRef.current.style.transform = `rotate(${angle}deg)`;
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      ref={spinnerRef}
      style={{
        width: 22,
        height: 22,
        borderRadius: "50%",
        border: "2px solid rgba(var(--ui-rgb), 0.15)",
        borderTopColor: "var(--mi-accent)",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function OrgChartView() {
  const [tree, setTree] = useState<UserNode[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [refetchKey, setRefetchKey] = useState(0);

  const handleManagerChanged = useCallback(() => {
    setRefetchKey((k) => k + 1);
  }, []);

  // Fetch org tree
  useEffect(() => {
    let cancelled = false;

    async function loadTree() {
      setLoading(true);
      setError(null);

      try {
        const token = authService.getAccessToken();
        if (!token) {
          setError("Not authenticated. Please log in again.");
          return;
        }

        const res = await fetch(`${API_BASE_URL}/api/admin/org-tree`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `Server error ${res.status}`);
        }

        const data = (await res.json()) as OrgTreeResponse;

        if (!cancelled) {
          setTree(data.tree ?? []);
          setTotalUsers(data.totalUsers ?? 0);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load org chart.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadTree();
    return () => {
      cancelled = true;
    };
  }, [refetchKey]);

  // Build a flat map of all nodes for list view manager lookups
  const { flatNodes, managerMap } = useMemo(() => {
    const map = new Map<string, UserNode>();
    const flat = flattenTree(tree, map);
    return { flatNodes: flat, managerMap: map };
  }, [tree]);

  const countLabel = loading
    ? "Loading..."
    : `${totalUsers} ${totalUsers === 1 ? "person" : "people"}`;

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      {/* Header */}
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
          <h2
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 20,
              color: "var(--text-primary)",
              fontWeight: 400,
              letterSpacing: "-0.2px",
              margin: 0,
            }}
          >
            Org Chart
          </h2>
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

        {/* Controls row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Search */}
          <div style={{ position: "relative" }}>
            <Search
              size={14}
              style={{
                position: "absolute",
                left: 11,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-tertiary)",
                pointerEvents: "none",
              }}
            />
            <input
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search people"
              style={{
                width: 220,
                height: 34,
                padding: "0 12px 0 34px",
                borderRadius: 8,
                border: "var(--border-subtle)",
                background: "var(--bg-raised)",
                color: "var(--text-primary)",
                fontSize: 13,
                outline: "none",
              }}
            />
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ borderTop: "var(--border-hairline)" }}>
        {loading ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "72px 0",
              gap: 14,
            }}
          >
            <Spinner />
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              Loading org chart...
            </span>
          </div>
        ) : error ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "72px 0",
              gap: 12,
            }}
          >
            <AlertCircle size={22} style={{ color: "var(--status-error)" }} />
            <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>
              Failed to load org chart
            </span>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{error}</span>
          </div>
        ) : tree.length === 0 ? (
          <div
            style={{
              padding: "72px 0",
              textAlign: "center",
              fontSize: 13,
              color: "var(--text-secondary)",
            }}
          >
            No org structure found.
          </div>
        ) : (
          <TreeViewBody
            tree={tree}
            searchQuery={searchQuery}
            flatNodes={flatNodes}
            managerMap={managerMap}
            onManagerChanged={handleManagerChanged}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tree view body
// ---------------------------------------------------------------------------

function TreeViewBody({
  tree,
  searchQuery,
  flatNodes,
  managerMap,
  onManagerChanged,
}: {
  tree: UserNode[];
  searchQuery: string;
  flatNodes: UserNode[];
  managerMap: Map<string, UserNode>;
  onManagerChanged: () => void;
}) {
  const hasQuery = searchQuery.length > 0;
  const visibleRoots = tree.filter((n) => nodeMatchesQuery(n, searchQuery));

  if (visibleRoots.length === 0) {
    return (
      <div
        style={{
          padding: "48px 0",
          textAlign: "center",
          fontSize: 13,
          color: "var(--text-secondary)",
        }}
      >
        No people found matching &ldquo;{searchQuery}&rdquo;
      </div>
    );
  }

  return (
    <div>
      {visibleRoots.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          depth={0}
          searchQuery={searchQuery}
          defaultExpanded={hasQuery || node.directReports.length <= 6}
          flatNodes={flatNodes}
          managerMap={managerMap}
          onManagerChanged={onManagerChanged}
        />
      ))}
    </div>
  );
}
