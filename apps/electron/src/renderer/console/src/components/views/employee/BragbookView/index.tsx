/**
 * BragbookView — Weekly/Monthly/Quarterly accomplishment journal
 *
 * Two-panel layout: TOC sidebar (left) + scrollable document (right).
 * Accomplishments are editable; period headers are fixed.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Loader2, AlertCircle, Plus, X } from "lucide-react";
import { useBragbook, useSaveBragbookPeriod, useGenerateBragbookPeriod } from "@/console/src/hooks/queries/bragbook";
import type { BragbookView as BragbookViewType } from "@/console/src/services/bragbookService";
import type { BragbookPeriod } from "@/console/src/services/bragbookService";

// ============================================================================
// Types
// ============================================================================

const VIEW_OPTIONS: { value: BragbookViewType; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
];

// ============================================================================
// Main Component
// ============================================================================

export default function BragbookView() {
  const [activeView, setActiveView] = useState<BragbookViewType>("weekly");
  const [activePeriod, setActivePeriod] = useState<string | null>(null);
  const [bottomPadding, setBottomPadding] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const { data, isLoading, error } = useBragbook(activeView);
  const periods = data?.periods ?? [];

  // Set first period as active when data loads
  useEffect(() => {
    if (periods.length > 0 && !activePeriod) {
      setActivePeriod(periods[0]!.periodStart);
    }
  }, [periods, activePeriod]);

  // Reset active period when view changes
  useEffect(() => {
    setActivePeriod(null);
  }, [activeView]);

  // Calculate bottom padding so the last section can scroll to the top
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || periods.length === 0) return;

    const updatePadding = () => {
      const lastPeriod = periods[periods.length - 1];
      if (!lastPeriod) return;
      const lastEl = sectionRefs.current.get(lastPeriod.periodStart);
      if (!lastEl) return;
      const containerHeight = container.clientHeight;
      const lastSectionHeight = lastEl.getBoundingClientRect().height;
      const needed = Math.max(0, containerHeight - lastSectionHeight - 32);
      setBottomPadding(needed);
    };

    // Recalculate after render settles
    const timeout = setTimeout(updatePadding, 100);
    const resizeObserver = new ResizeObserver(updatePadding);
    resizeObserver.observe(container);

    return () => {
      clearTimeout(timeout);
      resizeObserver.disconnect();
    };
  }, [periods]);

  // Scroll-based active period tracking
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || periods.length === 0) return;

    const handleScroll = () => {
      const containerTop = container.getBoundingClientRect().top;

      // Find the section whose top is closest to the container top
      let closest: string | null = null;
      let closestDistance = Infinity;

      for (const [periodStart, el] of sectionRefs.current) {
        const distance = el.getBoundingClientRect().top - containerTop;

        // Sections at or scrolled past the top (with small margin)
        if (distance <= 40 && Math.abs(distance) < closestDistance) {
          closestDistance = Math.abs(distance);
          closest = periodStart;
        }
      }

      // If nothing is above the top yet, pick the first visible section
      if (!closest) {
        for (const [periodStart, el] of sectionRefs.current) {
          const distance = el.getBoundingClientRect().top - containerTop;
          if (distance >= 0 && distance < closestDistance) {
            closestDistance = distance;
            closest = periodStart;
          }
        }
      }

      if (closest) setActivePeriod(closest);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => container.removeEventListener("scroll", handleScroll);
  }, [periods]);

  const scrollToSection = useCallback((periodStart: string) => {
    const el = sectionRefs.current.get(periodStart);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const setSectionRef = useCallback((periodStart: string, el: HTMLDivElement | null) => {
    if (el) {
      sectionRefs.current.set(periodStart, el);
    } else {
      sectionRefs.current.delete(periodStart);
    }
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div style={styles.centerContainer}>
        <Loader2 size={24} style={{ color: "var(--mi-accent)", animation: "spin 1s linear infinite" }} />
        <p style={{ color: "var(--text-tertiary)", fontSize: 13, marginTop: 12 }}>
          Loading bragbook...
        </p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={styles.centerContainer}>
        <AlertCircle size={24} style={{ color: "var(--status-error)", marginBottom: 12 }} />
        <p style={{ color: "var(--text-primary)", fontSize: 13, fontWeight: 500 }}>
          Failed to load bragbook
        </p>
      </div>
    );
  }

  return (
    <div className="app-no-drag" style={styles.root}>
      {/* Left: TOC Sidebar */}
      <div style={styles.tocSidebar}>
        <div style={styles.tocHeader}>
          <h1 style={styles.tocTitle}>Bragbook</h1>
          <p style={styles.tocSubtitle}>Your accomplishments</p>
        </div>

        {/* View Toggle */}
        <div style={styles.radioGroup}>
          {VIEW_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setActiveView(value)}
              style={{
                ...styles.radioButton,
                ...(activeView === value ? styles.radioButtonActive : {}),
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Period List */}
        <div style={styles.tocList}>
          {periods.map((period) => {
            const isActive = activePeriod === period.periodStart;
            const hasContent = period.accomplishments.length > 0;
            return (
              <button
                key={period.periodStart}
                onClick={() => scrollToSection(period.periodStart)}
                style={{
                  ...styles.tocItem,
                  ...(isActive ? styles.tocItemActive : {}),
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = "rgba(var(--ui-rgb), 0.04)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = "transparent";
                }}
              >
                <span style={{
                  ...styles.tocDot,
                  background: hasContent
                    ? "var(--mi-accent)"
                    : "rgba(var(--ui-rgb), 0.15)",
                }} />
                <span style={{
                  color: isActive ? "var(--mi-accent)" : "var(--text-secondary)",
                  fontSize: 13,
                  fontFamily: "var(--font-sans)",
                }}>
                  {period.periodLabel}
                </span>
                {hasContent && (
                  <span style={styles.tocCount}>{period.accomplishments.length}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Document Area */}
      <div ref={scrollContainerRef} style={styles.documentArea}>
        <div style={styles.documentContent}>
          {periods.length === 0 ? (
            <div style={styles.centerContainer}>
              <p style={{ color: "var(--text-tertiary)", fontSize: 14 }}>
                No periods to display
              </p>
            </div>
          ) : (
            <>
              {periods.map((period) => (
                <PeriodSection
                  key={period.periodStart}
                  period={period}
                  activeView={activeView}
                  ref={(el) => setSectionRef(period.periodStart, el)}
                />
              ))}
              {/* Spacer so the last section can scroll to the top */}
              {bottomPadding > 0 && <div style={{ height: bottomPadding }} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PeriodSection — individual week/month/quarter block
// ============================================================================

import { forwardRef } from "react";

const PeriodSection = forwardRef<HTMLDivElement, {
  period: BragbookPeriod;
  activeView: BragbookViewType;
}>(function PeriodSection({ period, activeView }, ref) {
  const saveMutation = useSaveBragbookPeriod();
  const generateMutation = useGenerateBragbookPeriod();
  const [localAccomplishments, setLocalAccomplishments] = useState<string[]>(period.accomplishments);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [isHovered, setIsHovered] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Sync local state when data changes externally
  useEffect(() => {
    setLocalAccomplishments(period.accomplishments);
  }, [period.accomplishments]);

  const debouncedSave = useCallback(
    (accomplishments: string[]) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveMutation.mutate({
          periodType: activeView,
          periodStart: period.periodStart,
          accomplishments,
        });
      }, 800);
    },
    [activeView, period.periodStart, saveMutation]
  );

  const updateAccomplishments = useCallback(
    (newList: string[]) => {
      setLocalAccomplishments(newList);
      debouncedSave(newList);
    },
    [debouncedSave]
  );

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setEditValue(localAccomplishments[index]!);
  };

  const commitEdit = () => {
    if (editingIndex === null) return;
    const trimmed = editValue.trim();
    if (trimmed) {
      const updated = [...localAccomplishments];
      updated[editingIndex] = trimmed;
      updateAccomplishments(updated);
    }
    setEditingIndex(null);
    setEditValue("");
  };

  const deleteAccomplishment = (index: number) => {
    const updated = localAccomplishments.filter((_, i) => i !== index);
    updateAccomplishments(updated);
    if (editingIndex === index) {
      setEditingIndex(null);
      setEditValue("");
    }
  };

  const addAccomplishment = () => {
    const trimmed = newValue.trim();
    if (trimmed) {
      updateAccomplishments([...localAccomplishments, trimmed]);
      setNewValue("");
      setIsAdding(false);
    }
  };

  return (
    <div
      ref={ref}
      data-period={period.periodStart}
      style={styles.periodSection}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Period heading (not editable) + Generate button */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ ...styles.periodHeading, margin: 0 }}>{period.periodLabel}</h2>
        {!period.isEdited && (isHovered || generateMutation.isPending) && (
          <button
            onClick={() => generateMutation.mutate({ periodType: activeView, periodStart: period.periodStart })}
            disabled={generateMutation.isPending}
            style={styles.generateButton}
            onMouseEnter={(e) => {
              if (!generateMutation.isPending) e.currentTarget.style.background = "rgba(var(--mi-accent-rgb), 0.13)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            {generateMutation.isPending ? "Generating..." : "Regenerate"}
          </button>
        )}
      </div>

      {/* Accomplishments */}
      {localAccomplishments.length > 0 ? (
        <ul style={styles.bulletList}>
          {localAccomplishments.map((item, index) => (
            <li
              key={index}
              style={styles.bulletItem}
              onMouseEnter={(e) => {
                const deleteBtn = e.currentTarget.querySelector("[data-delete]") as HTMLElement;
                if (deleteBtn) deleteBtn.style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                const deleteBtn = e.currentTarget.querySelector("[data-delete]") as HTMLElement;
                if (deleteBtn) deleteBtn.style.opacity = "0";
              }}
            >
              {editingIndex === index ? (
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") { setEditingIndex(null); setEditValue(""); }
                  }}
                  autoFocus
                  style={styles.editInput}
                />
              ) : (
                <>
                  <span style={styles.bulletMarker}>&#x2022;</span>
                  <span
                    onClick={() => startEdit(index)}
                    style={styles.bulletText}
                  >
                    {item}
                  </span>
                  <button
                    data-delete
                    onClick={() => deleteAccomplishment(index)}
                    style={styles.deleteButton}
                  >
                    <X size={14} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : !isAdding ? (
        <p style={styles.emptyText}>No accomplishments recorded</p>
      ) : null}

      {/* Add accomplishment */}
      {isAdding ? (
        <div style={styles.addInputRow}>
          <input
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addAccomplishment();
              if (e.key === "Escape") { setIsAdding(false); setNewValue(""); }
            }}
            autoFocus
            placeholder="What did you accomplish?"
            style={styles.editInput}
          />
          <button onClick={addAccomplishment} style={styles.addConfirmButton}>
            Add
          </button>
        </div>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          style={styles.addButton}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-tertiary)";
          }}
        >
          <Plus size={14} />
          <span>Add accomplishment</span>
        </button>
      )}
    </div>
  );
});

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    height: "100%",
    overflow: "hidden",
  },

  centerContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "80px 0",
    flex: 1,
  },

  // TOC Sidebar
  tocSidebar: {
    width: 220,
    minWidth: 220,
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid rgba(var(--ui-rgb), 0.08)",
    background: "var(--bg-base)",
    overflow: "hidden",
  },
  tocHeader: {
    padding: "24px 16px 0",
  },
  tocTitle: {
    fontFamily: "var(--font-serif)",
    fontSize: 24,
    color: "var(--text-primary)",
    fontWeight: 400,
    letterSpacing: "-0.3px",
    lineHeight: 1,
    margin: 0,
  },
  tocSubtitle: {
    fontFamily: "var(--font-serif)",
    fontSize: 13,
    color: "var(--text-tertiary)",
    fontWeight: 400,
    fontStyle: "italic",
    margin: "8px 0 0",
  },

  // Radio Toggle
  radioGroup: {
    display: "flex",
    gap: 2,
    padding: "16px 16px 12px",
    background: "transparent",
  },
  radioButton: {
    flex: 1,
    padding: "5px 0",
    fontSize: 11,
    fontFamily: "var(--font-sans)",
    fontWeight: 500,
    border: "none",
    borderRadius: 6,
    background: "transparent",
    color: "var(--text-tertiary)",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  radioButtonActive: {
    background: "rgba(var(--mi-accent-rgb), 0.13)",
    color: "var(--mi-accent)",
  },

  // TOC List
  tocList: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "0 8px 16px",
  },
  tocItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "7px 8px",
    border: "none",
    borderRadius: 6,
    background: "transparent",
    cursor: "pointer",
    transition: "background 0.12s ease",
    textAlign: "left" as const,
  },
  tocItemActive: {
    background: "rgba(var(--mi-accent-rgb), 0.13)",
  },
  tocDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    flexShrink: 0,
  },
  tocCount: {
    marginLeft: "auto",
    fontSize: 11,
    color: "var(--text-tertiary)",
    fontFamily: "var(--font-sans)",
    fontVariantNumeric: "tabular-nums",
  },

  // Document Area
  documentArea: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "32px 40px",
  },
  documentContent: {
    maxWidth: 680,
    margin: "0 auto",
  },

  // Generate button
  generateButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "4px 10px",
    border: "none",
    borderRadius: 6,
    background: "transparent",
    color: "var(--mi-accent)",
    fontSize: 12,
    fontFamily: "var(--font-sans)",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.12s ease",
    flexShrink: 0,
  },

  // Period Section
  periodSection: {
    paddingBottom: 32,
    marginBottom: 32,
    borderBottom: "1px solid rgba(var(--ui-rgb), 0.08)",
  },
  periodHeading: {
    fontFamily: "var(--font-serif)",
    fontSize: 22,
    fontWeight: 400,
    color: "var(--text-primary)",
    letterSpacing: "-0.3px",
    margin: "0 0 16px",
    lineHeight: 1.2,
  },

  // Bullets
  bulletList: {
    listStyle: "none",
    padding: 0,
    margin: "0 0 8px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  bulletItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "4px 0",
    position: "relative" as const,
  },
  bulletMarker: {
    color: "var(--text-tertiary)",
    fontSize: 14,
    lineHeight: 1.6,
    flexShrink: 0,
    userSelect: "none" as const,
  },
  bulletText: {
    fontFamily: "var(--font-sans)",
    fontSize: 14,
    color: "var(--text-secondary)",
    lineHeight: 1.6,
    cursor: "text",
    flex: 1,
  },
  deleteButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
    border: "none",
    borderRadius: 4,
    background: "transparent",
    color: "var(--text-tertiary)",
    cursor: "pointer",
    opacity: 0,
    transition: "opacity 0.12s ease",
    flexShrink: 0,
    marginTop: 2,
  },

  // Edit input
  editInput: {
    flex: 1,
    fontFamily: "var(--font-sans)",
    fontSize: 14,
    color: "var(--text-primary)",
    background: "rgba(var(--ui-rgb), 0.04)",
    border: "1px solid rgba(var(--ui-rgb), 0.12)",
    borderRadius: 6,
    padding: "6px 10px",
    outline: "none",
    lineHeight: 1.6,
  },

  // Empty state
  emptyText: {
    fontFamily: "var(--font-sans)",
    fontSize: 14,
    color: "var(--text-tertiary)",
    fontStyle: "italic",
    margin: "0 0 8px",
  },

  // Add button
  addButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 0",
    border: "none",
    background: "transparent",
    color: "var(--text-tertiary)",
    fontSize: 13,
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
    transition: "color 0.12s ease",
  },
  addInputRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
  addConfirmButton: {
    padding: "6px 14px",
    borderRadius: 6,
    border: "none",
    background: "var(--mi-accent)",
    color: "#fff",
    fontSize: 13,
    fontFamily: "var(--font-sans)",
    fontWeight: 500,
    cursor: "pointer",
    flexShrink: 0,
  },
};
