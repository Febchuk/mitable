import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, ChevronRight, Users, List, GitBranch, AlertCircle } from "lucide-react";
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

type ViewMode = "tree" | "list";

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
// Tree node — recursive
// ---------------------------------------------------------------------------

function TreeNode({
  node,
  depth,
  searchQuery,
  defaultExpanded,
}: {
  node: UserNode;
  depth: number;
  searchQuery: string;
  defaultExpanded: boolean;
}) {
  const hasReports = node.directReports.length > 0;
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [hovered, setHovered] = useState(false);

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
          cursor: hasReports ? "pointer" : "default",
        }}
        onClick={() => {
          if (hasReports) setExpanded((prev) => !prev);
        }}
      >
        {/* Expand / collapse chevron */}
        <div
          style={{
            width: 16,
            height: 16,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: hasReports ? "var(--text-secondary)" : "transparent",
          }}
        >
          {hasReports ? (
            expanded ? (
              <ChevronDown size={13} />
            ) : (
              <ChevronRight size={13} />
            )
          ) : null}
        </div>

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
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List view row
// ---------------------------------------------------------------------------

function ListRow({
  node,
  managerMap,
}: {
  node: UserNode;
  managerMap: Map<string, UserNode>;
}) {
  const [hovered, setHovered] = useState(false);
  const manager = node.managerId ? managerMap.get(node.managerId) : undefined;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "2fr 1.5fr 1.5fr 1fr 80px",
        alignItems: "center",
        gap: 12,
        padding: "10px 0",
        borderBottom: "var(--border-hairline)",
        background: hovered ? "rgba(var(--ui-rgb), 0.025)" : "transparent",
        transition: "background 0.12s ease",
      }}
    >
      {/* Name */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <Avatar node={node} size={28} />
        <div style={{ minWidth: 0 }}>
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
            {getFullName(node)}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-tertiary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {node.email}
          </div>
        </div>
      </div>

      {/* Job title */}
      <div
        style={{
          fontSize: 12,
          color: "var(--text-secondary)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {node.jobTitle ?? "—"}
      </div>

      {/* Manager */}
      <div
        style={{
          fontSize: 12,
          color: "var(--text-secondary)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {manager ? getFullName(manager) : "—"}
      </div>

      {/* Department */}
      <div
        style={{
          fontSize: 12,
          color: "var(--text-secondary)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {node.department ?? "—"}
      </div>

      {/* Reports count */}
      <div
        style={{
          fontSize: 12,
          color: "var(--text-tertiary)",
          display: "flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        {node.directReports.length > 0 && <Users size={11} style={{ opacity: 0.6 }} />}
        {node.directReports.length > 0 ? node.directReports.length : "—"}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List view header
// ---------------------------------------------------------------------------

function ListHeader() {
  const cellStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 500,
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    color: "var(--text-tertiary)",
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "2fr 1.5fr 1.5fr 1fr 80px",
        gap: 12,
        padding: "8px 0",
        borderBottom: "var(--border-hairline)",
      }}
    >
      <div style={cellStyle}>Name</div>
      <div style={cellStyle}>Job Title</div>
      <div style={cellStyle}>Manager</div>
      <div style={cellStyle}>Department</div>
      <div style={cellStyle}>Reports</div>
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
  const [viewMode, setViewMode] = useState<ViewMode>("tree");
  const [searchQuery, setSearchQuery] = useState("");

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
  }, []);

  // Build a flat map of all nodes for list view manager lookups
  const { flatNodes, managerMap } = useMemo(() => {
    const map = new Map<string, UserNode>();
    const flat = flattenTree(tree, map);
    return { flatNodes: flat, managerMap: map };
  }, [tree]);

  // Filter flat nodes for list view
  const filteredFlatNodes = useMemo(() => {
    if (!searchQuery) return flatNodes;
    const q = searchQuery.toLowerCase();
    return flatNodes.filter(
      (n) =>
        getFullName(n).toLowerCase().includes(q) ||
        n.email.toLowerCase().includes(q) ||
        (n.jobTitle ?? "").toLowerCase().includes(q) ||
        (n.department ?? "").toLowerCase().includes(q)
    );
  }, [flatNodes, searchQuery]);

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
            Org Chart
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

          {/* View mode toggle */}
          <div
            style={{
              display: "flex",
              gap: 1,
              background: "rgba(var(--ui-rgb), 0.05)",
              borderRadius: 7,
              padding: 3,
            }}
          >
            <button
              onClick={() => setViewMode("tree")}
              title="Tree view"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 11px",
                borderRadius: 5,
                fontSize: 12,
                fontFamily: "var(--font-sans)",
                color: viewMode === "tree" ? "var(--text-primary)" : "var(--text-secondary)",
                background: viewMode === "tree" ? "var(--bg-overlay)" : "transparent",
                border: "none",
                cursor: "pointer",
                transition: "background 0.1s, color 0.1s",
              }}
            >
              <GitBranch size={13} />
              Tree
            </button>
            <button
              onClick={() => setViewMode("list")}
              title="List view"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 11px",
                borderRadius: 5,
                fontSize: 12,
                fontFamily: "var(--font-sans)",
                color: viewMode === "list" ? "var(--text-primary)" : "var(--text-secondary)",
                background: viewMode === "list" ? "var(--bg-overlay)" : "transparent",
                border: "none",
                cursor: "pointer",
                transition: "background 0.1s, color 0.1s",
              }}
            >
              <List size={13} />
              List
            </button>
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
        ) : viewMode === "tree" ? (
          <TreeViewBody tree={tree} searchQuery={searchQuery} />
        ) : (
          <ListViewBody nodes={filteredFlatNodes} managerMap={managerMap} searchQuery={searchQuery} />
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
}: {
  tree: UserNode[];
  searchQuery: string;
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
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List view body
// ---------------------------------------------------------------------------

function ListViewBody({
  nodes,
  managerMap,
  searchQuery,
}: {
  nodes: UserNode[];
  managerMap: Map<string, UserNode>;
  searchQuery: string;
}) {
  if (nodes.length === 0) {
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
      <ListHeader />
      {nodes.map((node) => (
        <ListRow key={node.id} node={node} managerMap={managerMap} />
      ))}
    </div>
  );
}
