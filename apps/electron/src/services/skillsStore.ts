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
}

export const skillsStore = new SkillsStore();
