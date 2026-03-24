import { useState, useEffect, useMemo } from "react";
import { FileText, ChevronDown, ChevronRight, Folder } from "lucide-react";
import { FcGoogle } from "react-icons/fc";

// ─── Types matching SkillDefinition from skillsStore ─────────────────────

interface SkillToolParameter {
  type: string;
  required: boolean;
  description: string;
  values?: string[];
}

interface SkillTool {
  name: string;
  description: string;
  confirmationRequired: boolean;
  endpoint?: string;
  method?: string;
  runtime?: string;
  parameters: Record<string, SkillToolParameter>;
}

interface SkillDefinition {
  name: string;
  version: string;
  source: "mitable-preset" | "auto-generated" | "user-created";
  description: string;
  packages?: string[];
  runtime?: string;
  auth?: {
    type: string;
    provider: string;
    scopes: string[];
    checkEndpoint: string;
  };
  tools: SkillTool[];
}

// ─── Fallback presets (used when IPC unavailable, e.g. dev mode) ─────────

const FALLBACK_PRESETS: SkillDefinition[] = [
  {
    name: "google-suite",
    version: "1.0.0",
    source: "mitable-preset",
    description:
      "Send emails with attachments, manage Drive folders, upload files, create Google Docs",
    auth: {
      type: "oauth2",
      provider: "google",
      scopes: ["gmail.send", "gmail.readonly", "drive", "documents"],
      checkEndpoint: "/api/agent/skills/google-auth-status",
    },
    tools: [
      {
        name: "send_email",
        description: "Send an email via Gmail with optional attachment",
        confirmationRequired: true,
        endpoint: "/api/agent/skills/send-email",
        method: "POST",
        parameters: {
          to: { type: "string", required: true, description: "Recipient email address" },
          subject: { type: "string", required: true, description: "Email subject line" },
          body: { type: "string", required: true, description: "Email body (plain text)" },
          documentId: {
            type: "string",
            required: false,
            description: "Attach a generated document by reference ID",
          },
        },
      },
      {
        name: "create_drive_folder",
        description: "Create a new folder in Google Drive",
        confirmationRequired: false,
        endpoint: "/api/agent/skills/create-drive-folder",
        method: "POST",
        parameters: {
          name: { type: "string", required: true, description: "Folder name" },
          parentFolderId: {
            type: "string",
            required: false,
            description: "Parent folder ID (root if omitted)",
          },
        },
      },
      {
        name: "upload_to_drive",
        description: "Upload a file to Google Drive",
        confirmationRequired: false,
        endpoint: "/api/agent/skills/upload-to-drive",
        method: "POST",
        parameters: {
          documentId: {
            type: "string",
            required: false,
            description: "Reference to a generated document",
          },
          fileName: { type: "string", required: true, description: "File name with extension" },
          mimeType: { type: "string", required: false, description: "MIME type" },
          folderId: {
            type: "string",
            required: false,
            description: "Drive folder ID to upload into",
          },
        },
      },
      {
        name: "list_drive_folders",
        description: "List folders in Google Drive for file organization",
        confirmationRequired: false,
        endpoint: "/api/agent/skills/list-drive-folders",
        method: "GET",
        parameters: {},
      },
    ],
  },
  {
    name: "document-generation",
    version: "2.0.0",
    source: "mitable-preset",
    description:
      "Create Word docs, PDFs, Excel spreadsheets, and calendar events locally on your device",
    packages: ["docx@9.x", "pdf-lib@1.x", "exceljs@4.x", "ical-generator@10.x"],
    runtime: "local",
    tools: [
      {
        name: "generate_document",
        description: "Generate a Word .docx, PDF, or Google Doc from markdown content",
        confirmationRequired: false,
        runtime: "electron",
        parameters: {
          title: { type: "string", required: true, description: "Document title" },
          content: {
            type: "string",
            required: true,
            description: "Document content (supports markdown)",
          },
          format: {
            type: "enum",
            required: false,
            description: "Output format (default: docx)",
            values: ["docx", "pdf", "google-doc"],
          },
          folderId: {
            type: "string",
            required: false,
            description: "Google Drive folder ID (for google-doc format)",
          },
        },
      },
      {
        name: "generate_spreadsheet",
        description: "Generate an Excel .xlsx spreadsheet from structured data",
        confirmationRequired: false,
        runtime: "electron",
        parameters: {
          title: {
            type: "string",
            required: true,
            description: "Spreadsheet title (used as filename)",
          },
          headers: { type: "array", required: true, description: "Column header names" },
          rows: {
            type: "array",
            required: true,
            description: "Array of rows, each an array of cell values",
          },
          sheetName: {
            type: "string",
            required: false,
            description: "Worksheet name (defaults to title)",
          },
        },
      },
      {
        name: "create_calendar_event",
        description:
          "Create a calendar event (.ics) that can be saved, uploaded, or emailed as an invite",
        confirmationRequired: false,
        runtime: "electron",
        parameters: {
          title: { type: "string", required: true, description: "Event title/summary" },
          start: { type: "string", required: true, description: "Start time (ISO 8601)" },
          end: { type: "string", required: true, description: "End time (ISO 8601)" },
          description: {
            type: "string",
            required: false,
            description: "Event description or agenda",
          },
          location: {
            type: "string",
            required: false,
            description: "Event location or meeting link",
          },
          attendees: {
            type: "array",
            required: false,
            description: "Email addresses of attendees",
          },
        },
      },
      {
        name: "save_file_locally",
        description: "Save a generated file to Desktop, Documents, or Downloads",
        confirmationRequired: false,
        runtime: "electron",
        parameters: {
          documentId: {
            type: "string",
            required: true,
            description: "Reference ID from any generate tool",
          },
          fileName: { type: "string", required: false, description: "Override file name" },
          location: {
            type: "enum",
            required: false,
            description: "Save location (default: desktop)",
            values: ["desktop", "documents", "downloads"],
          },
        },
      },
    ],
  },
];

// ─── JSON Syntax Highlighter ────────────────────────────────────────────

function SyntaxHighlightedJson({ data }: { data: unknown }) {
  const highlighted = useMemo(() => {
    const json = JSON.stringify(data, null, 2);
    const lines = json.split("\n");

    return lines.map((line, i) => {
      const spans: React.ReactNode[] = [];
      let remaining = line;
      let key = 0;

      while (remaining.length > 0) {
        const wsMatch = remaining.match(/^(\s+)/);
        if (wsMatch) {
          spans.push(<span key={key++}>{wsMatch[1]}</span>);
          remaining = remaining.slice(wsMatch[1].length);
          continue;
        }

        const keyMatch = remaining.match(/^("(?:[^"\\]|\\.)*")\s*:/);
        if (keyMatch) {
          spans.push(
            <span key={key++} style={{ color: "#7eb6ff" }}>
              {keyMatch[1]}
            </span>
          );
          spans.push(
            <span key={key++} style={{ color: "#8b8b8b" }}>
              :{" "}
            </span>
          );
          remaining = remaining.slice(keyMatch[0].length);
          continue;
        }

        const strMatch = remaining.match(/^("(?:[^"\\]|\\.)*")(,?)/);
        if (strMatch) {
          spans.push(
            <span key={key++} style={{ color: "#a8d4a8" }}>
              {strMatch[1]}
            </span>
          );
          if (strMatch[2]) {
            spans.push(
              <span key={key++} style={{ color: "#8b8b8b" }}>
                {strMatch[2]}
              </span>
            );
          }
          remaining = remaining.slice(strMatch[0].length);
          continue;
        }

        const boolMatch = remaining.match(/^(true|false|null)(,?)/);
        if (boolMatch) {
          spans.push(
            <span key={key++} style={{ color: "#d4a8d4" }}>
              {boolMatch[1]}
            </span>
          );
          if (boolMatch[2]) {
            spans.push(
              <span key={key++} style={{ color: "#8b8b8b" }}>
                {boolMatch[2]}
              </span>
            );
          }
          remaining = remaining.slice(boolMatch[0].length);
          continue;
        }

        const numMatch = remaining.match(/^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)(,?)/);
        if (numMatch) {
          spans.push(
            <span key={key++} style={{ color: "#d4c078" }}>
              {numMatch[1]}
            </span>
          );
          if (numMatch[2]) {
            spans.push(
              <span key={key++} style={{ color: "#8b8b8b" }}>
                {numMatch[2]}
              </span>
            );
          }
          remaining = remaining.slice(numMatch[0].length);
          continue;
        }

        const bracketMatch = remaining.match(/^([{}[\],])/);
        if (bracketMatch) {
          spans.push(
            <span key={key++} style={{ color: "#8b8b8b" }}>
              {bracketMatch[1]}
            </span>
          );
          remaining = remaining.slice(1);
          continue;
        }

        spans.push(
          <span key={key++} style={{ color: "var(--text-secondary)" }}>
            {remaining[0]}
          </span>
        );
        remaining = remaining.slice(1);
      }

      return (
        <div key={i} style={{ minHeight: "1.5em" }}>
          {spans}
        </div>
      );
    });
  }, [data]);

  return (
    <div
      style={{
        fontSize: 12,
        lineHeight: 1.5,
        background: "#0d1117",
        border: "1px solid #21262d",
        borderRadius: 8,
        padding: "14px 16px",
        overflow: "auto",
        maxHeight: 420,
        fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
        whiteSpace: "pre",
      }}
    >
      {highlighted}
    </div>
  );
}

// ─── Skill Card Component ───────────────────────────────────────────────

function SkillIcon({ skill }: { skill: SkillDefinition }) {
  if (skill.auth?.provider === "google") return <FcGoogle size={22} />;
  return <FileText size={22} style={{ color: "var(--text-tertiary)" }} />;
}

function SkillCard({
  skill,
  isExpanded,
  onToggle,
}: {
  skill: SkillDefinition;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const toolNames = skill.tools.map((t) => t.name);

  return (
    <div
      style={{
        borderRadius: 10,
        border: "1px solid var(--stroke-subtle)",
        background: "var(--canvas-overlay)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          padding: "14px 16px",
          width: "100%",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div
          style={{
            flexShrink: 0,
            width: 22,
            height: 22,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 1,
          }}
        >
          <SkillIcon skill={skill} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--text-primary)",
              }}
            >
              {formatSkillName(skill.name)}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: "var(--accent-primary)",
                  background: "var(--accent-primary-subtle)",
                  padding: "2px 8px",
                  borderRadius: 999,
                }}
              >
                {skill.source === "mitable-preset"
                  ? "Active"
                  : skill.source === "auto-generated"
                    ? "Learned"
                    : "Custom"}
              </span>
              {isExpanded ? (
                <ChevronDown size={14} style={{ color: "var(--text-tertiary)" }} />
              ) : (
                <ChevronRight size={14} style={{ color: "var(--text-tertiary)" }} />
              )}
            </div>
          </div>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-tertiary)",
              margin: "4px 0 0",
              lineHeight: 1.4,
            }}
          >
            {skill.description}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
            {toolNames.map((t) => (
              <span
                key={t}
                style={{
                  fontSize: 10,
                  color: "#5eead4",
                  background: "rgba(94, 234, 212, 0.08)",
                  border: "1px solid rgba(94, 234, 212, 0.15)",
                  padding: "2px 7px",
                  borderRadius: 4,
                  fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </button>

      {isExpanded && (
        <div
          style={{
            borderTop: "1px solid var(--stroke-subtle)",
            padding: "14px 16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Skill Definition
            </span>
            <span
              style={{
                fontSize: 11,
                color: "#7eb6ff",
                fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
                background: "#0d1117",
                padding: "2px 8px",
                borderRadius: 4,
                border: "1px solid #21262d",
              }}
            >
              {skill.name}.skill.json
            </span>
          </div>
          <SyntaxHighlightedJson data={skill} />
        </div>
      )}
    </div>
  );
}

function formatSkillName(name: string): string {
  return name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─── Main Tab Component ─────────────────────────────────────────────────

export default function AgentSkillsTab() {
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [skillsDir, setSkillsDir] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [loadedSkills, dir] = await Promise.all([
          window.consoleAPI?.getAgentSkills?.() as Promise<SkillDefinition[]> | undefined,
          window.consoleAPI?.getAgentSkillsDir?.() as Promise<string> | undefined,
        ]);
        if (cancelled) return;
        const resolved = loadedSkills?.length ? loadedSkills : FALLBACK_PRESETS;
        setSkills(resolved as SkillDefinition[]);
        setSkillsDir(dir ?? "");
      } catch {
        if (!cancelled) setSkills(FALLBACK_PRESETS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const presetSkills = skills.filter((s) => s.source === "mitable-preset");
  const autoSkills = skills.filter((s) => s.source !== "mitable-preset");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div
        style={{
          paddingBottom: 16,
          borderBottom: "var(--border-hairline)",
        }}
      >
        <h2
          style={{
            fontSize: 16,
            fontWeight: 500,
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          Agent Skills
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "6px 0 0" }}>
          Skills installed on your device that the agent uses to take action
        </p>
        {skillsDir && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginTop: 8,
              fontSize: 11,
              color: "var(--text-tertiary)",
              fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
            }}
          >
            <Folder size={12} />
            <span>{skillsDir}</span>
          </div>
        )}
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Loading skills...</p>
      ) : (
        <>
          {/* Preset Skills */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                margin: 0,
              }}
            >
              Built-in
            </p>

            {presetSkills.map((skill) => (
              <SkillCard
                key={skill.name}
                skill={skill}
                isExpanded={expandedSkill === skill.name}
                onToggle={() =>
                  setExpandedSkill((prev) => (prev === skill.name ? null : skill.name))
                }
              />
            ))}

            {presetSkills.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                No built-in skills found.
              </p>
            )}
          </div>

          {/* Auto-Generated / Custom Skills */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                margin: 0,
              }}
            >
              Learned from your work
            </p>

            {autoSkills.length > 0 ? (
              autoSkills.map((skill) => (
                <SkillCard
                  key={skill.name}
                  skill={skill}
                  isExpanded={expandedSkill === skill.name}
                  onToggle={() =>
                    setExpandedSkill((prev) => (prev === skill.name ? null : skill.name))
                  }
                />
              ))
            ) : (
              <div
                style={{
                  padding: "24px 16px",
                  borderRadius: 10,
                  border: "1px dashed var(--stroke-subtle)",
                  textAlign: "center",
                }}
              >
                <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0 }}>
                  No custom skills yet. As you work, the agent will learn patterns and create
                  automations.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
