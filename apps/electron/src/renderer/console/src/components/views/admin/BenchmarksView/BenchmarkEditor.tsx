import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Minus, Loader2 } from "lucide-react";
import { useCreateBenchmark } from "@/console/src/hooks/queries/benchmarks";
import { generateBenchmarkAxes } from "@/console/src/services/benchmarkService";
import type {
  BenchmarkAxis,
  BenchmarkCategory,
  BenchmarkPeriod,
} from "@/console/src/services/benchmarkService";

const PERIODS: { key: BenchmarkPeriod; label: string }[] = [
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Quarterly" },
];

const CATEGORIES: { key: BenchmarkCategory; label: string }[] = [
  { key: "productivity", label: "Productivity" },
  { key: "collaboration", label: "Collaboration" },
  { key: "growth", label: "Growth" },
  { key: "quality", label: "Quality" },
];

function ImportanceDots({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {[1, 2, 3, 4, 5].map((level) => (
        <button
          key={level}
          onClick={() => onChange(level)}
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            border: "none",
            cursor: "pointer",
            background:
              level <= value
                ? "var(--text-primary)"
                : "rgba(var(--ui-rgb), 0.12)",
            transition: "background 0.15s, transform 0.1s",
            padding: 0,
          }}
          title={`Importance: ${level}`}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
          }}
        />
      ))}
    </div>
  );
}

function AxisRow({
  axis,
  onUpdate,
  onRemove,
  removeMode,
}: {
  axis: BenchmarkAxis;
  onUpdate: (updates: Partial<BenchmarkAxis>) => void;
  onRemove: () => void;
  removeMode: boolean;
}) {
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 0",
        borderBottom: "var(--border-hairline)",
        opacity: removeMode ? 0.7 : 1,
        transition: "opacity 0.15s",
      }}
    >
      {/* Name + description */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {editingName ? (
          <input
            autoFocus
            defaultValue={axis.name}
            onBlur={(e) => {
              onUpdate({ name: e.target.value || axis.name });
              setEditingName(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onUpdate({ name: (e.target as HTMLInputElement).value || axis.name });
                setEditingName(false);
              }
            }}
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-primary)",
              background: "rgba(var(--ui-rgb), 0.04)",
              border: "var(--border-hairline)",
              borderRadius: 4,
              padding: "2px 6px",
              fontFamily: "var(--font-sans)",
              width: "100%",
              outline: "none",
            }}
          />
        ) : (
          <div
            onClick={() => setEditingName(true)}
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-primary)",
              lineHeight: 1.2,
              cursor: "text",
            }}
          >
            {axis.name}
          </div>
        )}
        {editingDesc ? (
          <input
            autoFocus
            defaultValue={axis.description}
            onBlur={(e) => {
              onUpdate({ description: e.target.value || axis.description });
              setEditingDesc(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onUpdate({ description: (e.target as HTMLInputElement).value || axis.description });
                setEditingDesc(false);
              }
            }}
            style={{
              fontSize: 11,
              color: "var(--text-tertiary)",
              background: "rgba(var(--ui-rgb), 0.04)",
              border: "var(--border-hairline)",
              borderRadius: 4,
              padding: "2px 6px",
              fontFamily: "var(--font-sans)",
              width: "100%",
              outline: "none",
              marginTop: 4,
            }}
          />
        ) : (
          <div
            onClick={() => setEditingDesc(true)}
            style={{
              fontSize: 11,
              color: "var(--text-tertiary)",
              marginTop: 5,
              cursor: "text",
              lineHeight: 1.4,
            }}
          >
            {axis.description}
          </div>
        )}
      </div>

      {/* Importance dots */}
      <ImportanceDots
        value={axis.importance}
        onChange={(v) => onUpdate({ importance: v })}
      />

      {/* Remove button in remove mode */}
      {removeMode && (
        <button
          onClick={onRemove}
          title="Remove axis"
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            border: "none",
            background: "rgba(232, 116, 116, 0.1)",
            color: "var(--status-error)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transition: "background 0.1s",
          }}
        >
          <Minus size={12} />
        </button>
      )}
    </div>
  );
}

function IconButton({
  onClick,
  title,
  children,
  disabled,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        border: "var(--border-hairline)",
        background: hovered && !disabled ? "rgba(255,255,255,0.04)" : "transparent",
        color: disabled ? "var(--text-faint)" : "var(--text-secondary)",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.1s",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}

export default function BenchmarkEditor() {
  const navigate = useNavigate();
  const { mutateAsync: create, isPending: isSaving } = useCreateBenchmark();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<BenchmarkCategory>("productivity");
  const [period, setPeriod] = useState<BenchmarkPeriod>("monthly");
  const [axes, setAxes] = useState<BenchmarkAxis[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [removeMode, setRemoveMode] = useState(false);

  const handleGenerate = async () => {
    if (!description.trim()) return;
    setIsGenerating(true);
    try {
      const generated = await generateBenchmarkAxes(description);
      setAxes(generated);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddAxis = () => {
    setAxes((prev) => [
      ...prev,
      {
        id: `ax-${Date.now()}`,
        name: "New Axis",
        description: "Click to edit description",
        importance: 3,
      },
    ]);
  };

  const handleRemoveAxis = (id: string) => {
    setAxes((prev) => prev.filter((a) => a.id !== id));
    if (axes.length <= 2) setRemoveMode(false);
  };

  const handleUpdateAxis = (id: string, updates: Partial<BenchmarkAxis>) => {
    setAxes((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...updates } : a))
    );
  };

  const handleSave = async () => {
    if (!name.trim() || axes.length === 0) return;
    try {
      await create({ name, description, category, period, axes });
      navigate("/benchmarks");
    } catch {
      // Error handled by mutation
    }
  };

  const canSave = name.trim().length > 0 && axes.length > 0 && !isSaving;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        overflowY: "auto",
        padding: "28px 32px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
        boxSizing: "border-box",
      }}
    >
      {/* Back link */}
      <button
        onClick={() => navigate("/benchmarks")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          color: "var(--text-tertiary)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          fontFamily: "var(--font-sans)",
          alignSelf: "flex-start",
          transition: "color 0.1s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--text-secondary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--text-tertiary)";
        }}
      >
        <ArrowLeft size={14} />
        Benchmarks
      </button>

      {/* Title */}
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
        New Benchmark
      </h1>

      {/* Name input */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label
          style={{
            fontSize: 10,
            color: "var(--text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.09em",
            fontFamily: "var(--font-sans)",
          }}
        >
          Name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Engineering Excellence"
          style={{
            fontSize: 14,
            color: "var(--text-primary)",
            background: "rgba(var(--ui-rgb), 0.03)",
            border: "var(--border-hairline)",
            borderRadius: 8,
            padding: "10px 14px",
            fontFamily: "var(--font-sans)",
            outline: "none",
            transition: "border-color 0.15s",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "rgba(var(--ui-rgb), 0.2)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "";
          }}
        />
      </div>

      {/* Description textarea */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label
          style={{
            fontSize: 10,
            color: "var(--text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.09em",
            fontFamily: "var(--font-sans)",
          }}
        >
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what this benchmark measures. AI will generate scoring axes from this."
          rows={3}
          style={{
            fontSize: 14,
            color: "var(--text-primary)",
            background: "rgba(var(--ui-rgb), 0.03)",
            border: "var(--border-hairline)",
            borderRadius: 8,
            padding: "10px 14px",
            fontFamily: "var(--font-sans)",
            outline: "none",
            resize: "vertical",
            lineHeight: 1.5,
            transition: "border-color 0.15s",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "rgba(var(--ui-rgb), 0.2)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "";
          }}
        />
      </div>

      {/* Category + Period toggles */}
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
        {/* Category */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label
            style={{
              fontSize: 10,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.09em",
              fontFamily: "var(--font-sans)",
            }}
          >
            Category
          </label>
          <div
            style={{
              display: "flex",
              gap: 4,
              background: "rgba(var(--ui-rgb), 0.05)",
              borderRadius: 7,
              padding: 3,
            }}
          >
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                style={{
                  padding: "4px 12px",
                  borderRadius: 5,
                  fontSize: 11,
                  fontFamily: "var(--font-sans)",
                  color:
                    category === c.key
                      ? "var(--text-primary)"
                      : "var(--text-tertiary)",
                  background:
                    category === c.key
                      ? "rgba(255,255,255,0.08)"
                      : "transparent",
                  border: "none",
                  cursor: "pointer",
                  transition: "background 0.1s, color 0.1s",
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Period */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label
            style={{
              fontSize: 10,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.09em",
              fontFamily: "var(--font-sans)",
            }}
          >
            Period
          </label>
          <div
            style={{
              display: "flex",
              gap: 4,
              background: "rgba(var(--ui-rgb), 0.05)",
              borderRadius: 7,
              padding: 3,
            }}
          >
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                style={{
                  padding: "4px 12px",
                  borderRadius: 5,
                  fontSize: 11,
                  fontFamily: "var(--font-sans)",
                  color:
                    period === p.key
                      ? "var(--text-primary)"
                      : "var(--text-tertiary)",
                  background:
                    period === p.key
                      ? "rgba(255,255,255,0.08)"
                      : "transparent",
                  border: "none",
                  cursor: "pointer",
                  transition: "background 0.1s, color 0.1s",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={!description.trim() || isGenerating}
        style={{
          alignSelf: "flex-start",
          height: 36,
          padding: "0 20px",
          borderRadius: 8,
          fontSize: 12,
          fontFamily: "var(--font-sans)",
          fontWeight: 500,
          border: "var(--border-hairline)",
          cursor: !description.trim() || isGenerating ? "not-allowed" : "pointer",
          background:
            description.trim() && !isGenerating
              ? "rgba(var(--ui-rgb), 0.06)"
              : "transparent",
          color:
            description.trim() && !isGenerating
              ? "var(--text-primary)"
              : "var(--text-faint)",
          transition: "all 0.15s",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {isGenerating && (
          <Loader2
            size={13}
            className="animate-spin"
          />
        )}
        {isGenerating ? "Generating..." : "Generate Axes"}
      </button>

      {/* Axes section */}
      {axes.length > 0 && (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
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
              Axes
            </span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {removeMode ? (
                <button
                  onClick={() => setRemoveMode(false)}
                  style={{
                    height: 32,
                    padding: "0 14px",
                    borderRadius: 8,
                    fontSize: 11,
                    fontFamily: "var(--font-sans)",
                    border: "var(--border-hairline)",
                    cursor: "pointer",
                    background: "transparent",
                    color: "var(--text-tertiary)",
                    transition: "color 0.15s",
                  }}
                >
                  Done
                </button>
              ) : (
                <>
                  <IconButton onClick={handleAddAxis} title="Add axis">
                    <Plus size={14} />
                  </IconButton>
                  <IconButton
                    onClick={() => setRemoveMode(true)}
                    title="Remove axes"
                    disabled={axes.length <= 1}
                  >
                    <Minus size={14} />
                  </IconButton>
                </>
              )}
            </div>
          </div>
          <div style={{ borderTop: "var(--border-hairline)" }}>
            {axes.map((axis) => (
              <AxisRow
                key={axis.id}
                axis={axis}
                onUpdate={(updates) => handleUpdateAxis(axis.id, updates)}
                onRemove={() => handleRemoveAxis(axis.id)}
                removeMode={removeMode}
              />
            ))}
          </div>
        </div>
      )}

      {/* Save button */}
      <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 8 }}>
        <button
          onClick={handleSave}
          disabled={!canSave}
          style={{
            height: 40,
            padding: "0 28px",
            borderRadius: 8,
            fontSize: 13,
            fontFamily: "var(--font-sans)",
            fontWeight: 500,
            border: "none",
            cursor: canSave ? "pointer" : "not-allowed",
            background: canSave
              ? "var(--text-primary)"
              : "rgba(var(--ui-rgb), 0.08)",
            color: canSave
              ? "var(--bg-primary)"
              : "var(--text-faint)",
            transition: "all 0.15s",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {isSaving && (
            <Loader2
              size={13}
              className="animate-spin"
            />
          )}
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
