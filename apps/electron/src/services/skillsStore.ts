import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import matter from "gray-matter";
import { createLogger } from "../lib/logger";

const logger = createLogger("SkillsStore");

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  contextSummary: string;
  relatedApps: string[];
  sourceType: string;
  sourceIds: string[];
  lastRefreshedAt: string;
  usageCount: number;
  relevanceScore: number;
  createdAt: string;
  updatedAt: string;
}

const AGENT_DIR = path.join(app.getPath("home"), ".mitable", "agent");
const SKILLS_DIR = path.join(AGENT_DIR, "skills");
const MEMORY_DIR = path.join(AGENT_DIR, "memory");

// ─── Executable Skill Definitions (.skill.json) ────────────────────────

export interface SkillToolParameter {
  type: string;
  required: boolean;
  description: string;
  values?: string[];
}

export interface SkillTool {
  name: string;
  description: string;
  confirmationRequired: boolean;
  endpoint?: string;
  method?: string;
  runtime?: string;
  parameters: Record<string, SkillToolParameter>;
}

export interface SkillDefinition {
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

const PRESET_SKILLS: SkillDefinition[] = [
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
        description:
          "Send an email via Gmail. Supports optional file attachment via documentId from generate_document.",
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
        description:
          "Upload a file to Google Drive. Accepts documentId reference or raw base64 content.",
        confirmationRequired: false,
        endpoint: "/api/agent/skills/upload-to-drive",
        method: "POST",
        parameters: {
          documentId: {
            type: "string",
            required: false,
            description: "Reference to a generated document (preferred)",
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
        description:
          "Generate a Word .docx, PDF, or Google Doc from markdown content. Returns a documentId reference.",
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
        description:
          "Generate an Excel .xlsx spreadsheet from structured data. Returns a documentId reference.",
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
            description: "Array of rows, each row is an array of cell values",
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
          "Create a calendar event (.ics file) that can be saved, uploaded, or emailed as an invite.",
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
        description: "Save a generated file to the user's Desktop, Documents, or Downloads folder.",
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

const MEMORY_TEMPLATE = `# Agent Memory

This file persists across conversations. The Mitable Agent reads it for context.
You (or the agent) can add notes, preferences, and learnings here.

## User Preferences
<!-- Add notes about how the user likes to work -->

## Learnings
<!-- Patterns discovered across sessions -->
`;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

class SkillsStore {
  private initialized = false;

  private async ensureDirectories(): Promise<void> {
    if (this.initialized) return;
    await fs.promises.mkdir(SKILLS_DIR, { recursive: true });
    await fs.promises.mkdir(MEMORY_DIR, { recursive: true });

    // Seed MEMORY.md if it doesn't exist
    const memoryPath = path.join(MEMORY_DIR, "MEMORY.md");
    if (!fs.existsSync(memoryPath)) {
      await fs.promises.writeFile(memoryPath, MEMORY_TEMPLATE, "utf-8");
      logger.info("Seeded MEMORY.md template");
    }

    // Migrate from old JSON format if needed
    await this.migrateFromJson();

    // Sync preset executable skills (.skill.json)
    await this.syncPresetSkills();

    this.initialized = true;
  }

  async getAll(): Promise<AgentSkill[]> {
    await this.ensureDirectories();
    const skills: AgentSkill[] = [];

    let files: string[];
    try {
      files = await fs.promises.readdir(SKILLS_DIR);
    } catch {
      return [];
    }

    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      try {
        const content = await fs.promises.readFile(path.join(SKILLS_DIR, file), "utf-8");
        const parsed = matter(content);
        const fm = parsed.data as Record<string, unknown>;

        skills.push({
          id: (fm.id as string) || slugify(file.replace(/\.md$/, "")),
          name: (fm.name as string) || file.replace(/\.md$/, "").replace(/-/g, " "),
          description: (fm.description as string) || "",
          category: (fm.category as string) || "general",
          contextSummary: parsed.content.trim(),
          relatedApps: (fm.relatedApps as string[]) || [],
          sourceType: (fm.sourceType as string) || "unknown",
          sourceIds: (fm.sourceIds as string[]) || [],
          lastRefreshedAt: (fm.lastRefreshedAt as string) || (fm.updatedAt as string) || "",
          usageCount: (fm.usageCount as number) || 0,
          relevanceScore: (fm.relevanceScore as number) ?? 0.5,
          createdAt: (fm.createdAt as string) || "",
          updatedAt: (fm.updatedAt as string) || "",
        });
      } catch (e) {
        logger.error(`Failed to parse skill file: ${file}`, e);
      }
    }

    return skills;
  }

  async getRelevant(limit = 20): Promise<AgentSkill[]> {
    const skills = await this.getAll();
    return skills
      .filter((s) => s.relevanceScore > 0.1)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);
  }

  async mergeSkills(
    newSkills: Array<{
      name: string;
      description: string;
      category: string;
      contextSummary: string;
      relatedApps: string[];
    }>,
    sourceType: string,
    sourceIds: string[]
  ): Promise<void> {
    await this.ensureDirectories();
    const existing = await this.getAll();
    const now = new Date().toISOString();

    for (const newSkill of newSkills) {
      // Match by category + overlapping relatedApps
      const match = existing.find(
        (s) =>
          s.category === newSkill.category &&
          s.relatedApps.some((a) => newSkill.relatedApps.includes(a))
      );

      if (match) {
        match.contextSummary = newSkill.contextSummary;
        match.description = newSkill.description;
        match.sourceIds = [...new Set([...match.sourceIds, ...sourceIds])];
        match.relatedApps = [...new Set([...match.relatedApps, ...newSkill.relatedApps])];
        match.relevanceScore = Math.min(1.0, match.relevanceScore + 0.1);
        match.lastRefreshedAt = now;
        match.updatedAt = now;
        await this.writeSkill(match);
      } else {
        const skill: AgentSkill = {
          id: randomUUID(),
          name: newSkill.name,
          description: newSkill.description,
          category: newSkill.category,
          contextSummary: newSkill.contextSummary,
          relatedApps: newSkill.relatedApps,
          sourceType,
          sourceIds,
          lastRefreshedAt: now,
          usageCount: 0,
          relevanceScore: 0.8,
          createdAt: now,
          updatedAt: now,
        };
        existing.push(skill);
        await this.writeSkill(skill);
      }
    }

    // Cap at 50 files — delete lowest relevanceScore
    if (existing.length > 50) {
      const sorted = [...existing].sort((a, b) => a.relevanceScore - b.relevanceScore);
      const toDelete = sorted.slice(0, existing.length - 50);
      for (const skill of toDelete) {
        const filePath = path.join(SKILLS_DIR, `${slugify(skill.name)}.md`);
        try {
          await fs.promises.unlink(filePath);
        } catch {
          // File may not exist
        }
      }
    }

    logger.info(`Merged ${newSkills.length} skills, total: ${Math.min(existing.length, 50)}`);
  }

  async deleteSkill(id: string): Promise<void> {
    const skills = await this.getAll();
    const skill = skills.find((s) => s.id === id);
    if (skill) {
      const filePath = path.join(SKILLS_DIR, `${slugify(skill.name)}.md`);
      try {
        await fs.promises.unlink(filePath);
        logger.info(`Deleted skill: ${skill.name}`);
      } catch (e) {
        logger.error(`Failed to delete skill file: ${filePath}`, e);
      }
    }
  }

  async decayStaleSkills(): Promise<void> {
    const skills = await this.getAll();
    const now = Date.now();
    let changed = false;

    for (const skill of skills) {
      const daysSinceRefresh =
        (now - new Date(skill.lastRefreshedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceRefresh > 1) {
        const decayFactor = Math.pow(0.95, daysSinceRefresh);
        const newScore = skill.relevanceScore * decayFactor;
        if (Math.abs(newScore - skill.relevanceScore) > 0.001) {
          skill.relevanceScore = Math.round(newScore * 1000) / 1000;
          changed = true;

          if (skill.relevanceScore <= 0.05) {
            // Remove skills that decayed below threshold
            const filePath = path.join(SKILLS_DIR, `${slugify(skill.name)}.md`);
            try {
              await fs.promises.unlink(filePath);
            } catch {
              // File may not exist
            }
          } else {
            await this.writeSkill(skill);
          }
        }
      }
    }

    if (changed) {
      const remaining = (await this.getAll()).length;
      logger.info(`Decayed stale skills, remaining: ${remaining}`);
    }
  }

  async getMemoryContent(): Promise<string> {
    await this.ensureDirectories();
    const parts: string[] = [];

    let files: string[];
    try {
      files = await fs.promises.readdir(MEMORY_DIR);
    } catch {
      return "";
    }

    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      try {
        const content = await fs.promises.readFile(path.join(MEMORY_DIR, file), "utf-8");
        parts.push(content.trim());
      } catch (e) {
        logger.error(`Failed to read memory file: ${file}`, e);
      }
    }

    return parts.join("\n\n");
  }

  private async writeSkill(skill: AgentSkill): Promise<void> {
    await this.ensureDirectories();
    const frontmatter = {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      category: skill.category,
      relatedApps: skill.relatedApps,
      sourceType: skill.sourceType,
      sourceIds: skill.sourceIds,
      lastRefreshedAt: skill.lastRefreshedAt,
      usageCount: skill.usageCount,
      relevanceScore: skill.relevanceScore,
      createdAt: skill.createdAt,
      updatedAt: skill.updatedAt,
    };

    const content = matter.stringify(`\n# ${skill.name}\n\n${skill.contextSummary}\n`, frontmatter);
    const filePath = path.join(SKILLS_DIR, `${slugify(skill.name)}.md`);
    await fs.promises.writeFile(filePath, content, "utf-8");
  }

  private async migrateFromJson(): Promise<void> {
    const userDataPath = app.getPath("userData");
    const oldPath = path.join(userDataPath, "agent-skills.json");

    if (!fs.existsSync(oldPath)) return;

    // Only migrate if skills dir is empty
    try {
      const existingFiles = await fs.promises.readdir(SKILLS_DIR);
      if (existingFiles.some((f) => f.endsWith(".md"))) return;
    } catch {
      // Dir doesn't exist yet, proceed with migration
    }

    try {
      const raw = await fs.promises.readFile(oldPath, "utf-8");
      const data = JSON.parse(raw) as { skills: AgentSkill[] };

      if (data.skills?.length) {
        for (const skill of data.skills) {
          await this.writeSkill(skill);
        }
        logger.info(`Migrated ${data.skills.length} skills from JSON to .md files`);
      }

      // Rename old file to .bak
      await fs.promises.rename(oldPath, `${oldPath}.bak`);
      logger.info("Renamed old agent-skills.json to .bak");
    } catch (e) {
      logger.error("Failed to migrate skills from JSON", e);
    }
  }

  // ─── Executable Skills (.skill.json) ──────────────────────────────────

  /**
   * Sync preset skills to the user's skills directory.
   * Only writes if the file doesn't exist or the bundled version is newer.
   */
  private async syncPresetSkills(): Promise<void> {
    for (const preset of PRESET_SKILLS) {
      const fileName = `${preset.name}.skill.json`;
      const filePath = path.join(SKILLS_DIR, fileName);

      try {
        if (fs.existsSync(filePath)) {
          const existing = JSON.parse(
            await fs.promises.readFile(filePath, "utf-8")
          ) as SkillDefinition;

          // Only overwrite if bundled version is newer
          if (existing.version >= preset.version && existing.source === "mitable-preset") {
            continue;
          }
        }

        await fs.promises.writeFile(filePath, JSON.stringify(preset, null, 2), "utf-8");
        logger.info(`Synced preset skill: ${fileName}`);
      } catch (e) {
        logger.error(`Failed to sync preset skill: ${fileName}`, e);
      }
    }
  }

  /**
   * Read all executable skill definitions (.skill.json) from disk.
   */
  async getExecutableSkills(): Promise<SkillDefinition[]> {
    await this.ensureDirectories();
    const skills: SkillDefinition[] = [];

    let files: string[];
    try {
      files = await fs.promises.readdir(SKILLS_DIR);
    } catch {
      return [];
    }

    for (const file of files) {
      if (!file.endsWith(".skill.json")) continue;
      try {
        const content = await fs.promises.readFile(path.join(SKILLS_DIR, file), "utf-8");
        const skill = JSON.parse(content) as SkillDefinition;
        skills.push(skill);
      } catch (e) {
        logger.error(`Failed to parse skill file: ${file}`, e);
      }
    }

    return skills;
  }

  /**
   * Get the path to the skills directory (for display in UI).
   */
  getSkillsDirectory(): string {
    return SKILLS_DIR;
  }
}

export const skillsStore = new SkillsStore();
