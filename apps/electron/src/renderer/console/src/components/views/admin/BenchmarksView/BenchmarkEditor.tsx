import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Minus, Loader2 } from "lucide-react";
import {
  useBenchmarkDetail,
  useCreateBenchmark,
  useUpdateBenchmark,
  useUpdateBenchmarkParameters,
} from "@/console/src/hooks/queries/benchmarks";
import {
  generateBenchmarkParameters,
  fetchBenchmarkParameters,
} from "@/console/src/services/benchmarkService";
import type {
  BenchmarkParameter,
  BenchmarkFrequency,
} from "@/console/src/services/benchmarkService";

const FREQUENCIES: { key: BenchmarkFrequency; label: string }[] = [
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Quarterly" },
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

function ParameterRow({
  param,
  onUpdate,
  onRemove,
  removeMode,
}: {
  param: BenchmarkParameter;
  onUpdate: (updates: Partial<BenchmarkParameter>) => void;
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
            defaultValue={param.name}
            onBlur={(e) => {
              onUpdate({ name: e.target.value || param.name });
              setEditingName(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onUpdate({ name: (e.target as HTMLInputElement).value || param.name });
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
            {param.name}
          </div>
        )}
        {editingDesc ? (
          <input
            autoFocus
            defaultValue={param.description}
            onBlur={(e) => {
              onUpdate({ description: e.target.value || param.description });
              setEditingDesc(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onUpdate({ description: (e.target as HTMLInputElement).value || param.description });
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
            {param.description}
          </div>
        )}
      </div>

      {/* Importance dots */}
      <ImportanceDots
        value={param.importance}
        onChange={(v) => onUpdate({ importance: v })}
      />

      {/* Remove button in remove mode */}
      {removeMode && (
        <button
          onClick={onRemove}
          title="Remove parameter"
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
  const { id } = useParams<{ id?: string }>();
  const isEditMode = !!id;

  const { mutateAsync: create, isPending: isCreating } = useCreateBenchmark();
  const { mutateAsync: updateBenchmark, isPending: isUpdatingBenchmark } = useUpdateBenchmark();
  const { mutateAsync: updateParams, isPending: isUpdatingParams } = useUpdateBenchmarkParameters();

  const isSaving = isCreating || isUpdatingBenchmark || isUpdatingParams;

  // Fetch existing benchmark in edit mode
  const { data: existingBenchmark } = useBenchmarkDetail(isEditMode ? id! : "");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState<BenchmarkFrequency>("monthly");
  const [params, setParams] = useState<BenchmarkParameter[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [removeMode, setRemoveMode] = useState(false);
  const [paramsLoaded, setParamsLoaded] = useState(false);

  // Pre-populate fields from existing benchmark
  useEffect(() => {
    if (existingBenchmark) {
      setName(existingBenchmark.name);
      setDescription(existingBenchmark.description || "");
      setFrequency(existingBenchmark.frequency);
    }
  }, [existingBenchmark]);

  // Load existing parameters in edit mode
  useEffect(() => {
    if (!isEditMode || !id || paramsLoaded) return;
    fetchBenchmarkParameters(id)
      .then((loaded) => {
        setParams(loaded);
        setParamsLoaded(true);
      })
      .catch(() => {
        setParamsLoaded(true);
      });
  }, [id, isEditMode, paramsLoaded]);

  const handleGenerate = async () => {
    if (!description.trim()) return;
    setIsGenerating(true);
    try {
      const generated = await generateBenchmarkParameters(description);
      setParams(generated);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddParam = () => {
    setParams((prev) => [
      ...prev,
      {
        id: `param-${Date.now()}`,
        name: "New Parameter",
        description: "Click to edit description",
        importance: 3,
      },
    ]);
  };

  const handleRemoveParam = (paramId: string) => {
    setParams((prev) => prev.filter((a) => a.id !== paramId));
    if (params.length <= 2) setRemoveMode(false);
  };

  const handleUpdateParam = (paramId: string, updates: Partial<BenchmarkParameter>) => {
    setParams((prev) =>
      prev.map((a) => (a.id === paramId ? { ...a, ...updates } : a))
    );
  };

  const handleSave = async () => {
    if (!name.trim() || params.length === 0) return;
    try {
      if (isEditMode && id) {
        await updateBenchmark({ id, payload: { name, description, frequency } });
        await updateParams({ benchmarkId: id, parameters: params });
        navigate(`/benchmarks/${id}`);
      } else {
        await create({ name, description, frequency, parameters: params });
        navigate("/benchmarks");
      }
    } catch {
      // Error handled by mutations
    }
  };

  const canSave = name.trim().length > 0 && params.length > 0 && !isSaving;

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
        onClick={() => (isEditMode && id ? navigate(`/benchmarks/${id}`) : navigate("/benchmarks"))}
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
        {isEditMode ? "Benchmark" : "Benchmarks"}
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
        {isEditMode ? "Edit Benchmark" : "New Benchmark"}
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
          placeholder="Describe what this benchmark measures. AI will generate scoring parameters from this."
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

      {/* Frequency toggle */}
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
        {/* Frequency */}
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
            Frequency
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
            {FREQUENCIES.map((f) => (
              <button
                key={f.key}
                onClick={() => setFrequency(f.key)}
                style={{
                  padding: "4px 12px",
                  borderRadius: 5,
                  fontSize: 11,
                  fontFamily: "var(--font-sans)",
                  color:
                    frequency === f.key
                      ? "var(--text-primary)"
                      : "var(--text-tertiary)",
                  background:
                    frequency === f.key
                      ? "rgba(255,255,255,0.08)"
                      : "transparent",
                  border: "none",
                  cursor: "pointer",
                  transition: "background 0.1s, color 0.1s",
                }}
              >
                {f.label}
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
        {isGenerating ? "Generating..." : "Generate Parameters"}
      </button>

      {/* Parameters section */}
      {params.length > 0 && (
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
              Parameters
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
                  <IconButton onClick={handleAddParam} title="Add parameter">
                    <Plus size={14} />
                  </IconButton>
                  <IconButton
                    onClick={() => setRemoveMode(true)}
                    title="Remove parameters"
                    disabled={params.length <= 1}
                  >
                    <Minus size={14} />
                  </IconButton>
                </>
              )}
            </div>
          </div>
          <div style={{ borderTop: "var(--border-hairline)" }}>
            {params.map((p) => (
              <ParameterRow
                key={p.id}
                param={p}
                onUpdate={(updates) => handleUpdateParam(p.id, updates)}
                onRemove={() => handleRemoveParam(p.id)}
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
