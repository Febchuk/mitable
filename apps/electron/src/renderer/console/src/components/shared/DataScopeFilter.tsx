import { useUser } from "../../context/UserContext";
import type { DataScope } from "../../types";

const SCOPE_LABELS: Record<DataScope, string> = {
  direct: "Direct Reports",
  "all-reports": "All Reports",
  "org-wide": "Org-wide",
};

interface DataScopeFilterProps {
  onScopeChange?: () => void;
  dimmed?: boolean;
  leading?: React.ReactNode;
  children?: React.ReactNode;
}

export default function DataScopeFilter({
  onScopeChange,
  dimmed,
  leading,
  children,
}: DataScopeFilterProps = {}) {
  const { viewMode, dataScope, availableDataScopes, setDataScope } = useUser();

  // Only show in Team view with more than one option
  if (viewMode !== "manager" || availableDataScopes.length <= 1) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: 1,
        background: "rgba(var(--ui-rgb), 0.05)",
        borderRadius: 6,
        padding: 2,
      }}
    >
      {leading}
      {availableDataScopes.map((scope) => {
        const isActive = dataScope === scope && !dimmed;
        return (
          <button
            key={scope}
            onClick={() => {
              setDataScope(scope);
              onScopeChange?.();
            }}
            style={{
              padding: "4px 10px",
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 500,
              border: "none",
              cursor: "pointer",
              transition: "background 0.1s, color 0.1s",
              background: isActive ? "rgba(var(--ui-rgb), 0.12)" : "transparent",
              color: isActive ? "var(--text-primary)" : "var(--text-tertiary)",
              whiteSpace: "nowrap",
            }}
          >
            {SCOPE_LABELS[scope]}
          </button>
        );
      })}
      {children}
    </div>
  );
}
