import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
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

interface SkillsFile {
  version: 1;
  skills: AgentSkill[];
}

class SkillsStore {
  private filePath: string;

  constructor() {
    const userDataPath = app.getPath("userData");
    this.filePath = path.join(userDataPath, "agent-skills.json");
  }

  async getAll(): Promise<AgentSkill[]> {
    const data = await this.read();
    return data.skills;
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
    const data = await this.read();
    const now = new Date().toISOString();

    for (const newSkill of newSkills) {
      // Match by category + overlapping relatedApps
      const existing = data.skills.find(
        (s) =>
          s.category === newSkill.category &&
          s.relatedApps.some((app) => newSkill.relatedApps.includes(app))
      );

      if (existing) {
        existing.contextSummary = newSkill.contextSummary;
        existing.description = newSkill.description;
        existing.sourceIds = [...new Set([...existing.sourceIds, ...sourceIds])];
        existing.relatedApps = [...new Set([...existing.relatedApps, ...newSkill.relatedApps])];
        existing.relevanceScore = Math.min(1.0, existing.relevanceScore + 0.1);
        existing.lastRefreshedAt = now;
        existing.updatedAt = now;
      } else {
        data.skills.push({
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
        });
      }
    }

    // Cap at 50 skills (drop lowest relevanceScore)
    if (data.skills.length > 50) {
      data.skills.sort((a, b) => b.relevanceScore - a.relevanceScore);
      data.skills = data.skills.slice(0, 50);
    }

    await this.write(data);
    logger.info(`Merged ${newSkills.length} skills, total: ${data.skills.length}`);
  }

  async deleteSkill(id: string): Promise<void> {
    const data = await this.read();
    data.skills = data.skills.filter((s) => s.id !== id);
    await this.write(data);
  }

  async decayStaleSkills(): Promise<void> {
    const data = await this.read();
    const now = Date.now();
    let changed = false;

    for (const skill of data.skills) {
      const daysSinceRefresh =
        (now - new Date(skill.lastRefreshedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceRefresh > 1) {
        const decayFactor = Math.pow(0.95, daysSinceRefresh);
        const newScore = skill.relevanceScore * decayFactor;
        if (Math.abs(newScore - skill.relevanceScore) > 0.001) {
          skill.relevanceScore = Math.round(newScore * 1000) / 1000;
          changed = true;
        }
      }
    }

    if (changed) {
      // Remove skills that decayed below threshold
      data.skills = data.skills.filter((s) => s.relevanceScore > 0.05);
      await this.write(data);
      logger.info(`Decayed stale skills, remaining: ${data.skills.length}`);
    }
  }

  private async read(): Promise<SkillsFile> {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = await fs.promises.readFile(this.filePath, "utf-8");
        return JSON.parse(raw) as SkillsFile;
      }
    } catch (e) {
      logger.error("Failed to read skills file, starting fresh", e);
    }
    return { version: 1, skills: [] };
  }

  private async write(data: SkillsFile): Promise<void> {
    await fs.promises.writeFile(this.filePath, JSON.stringify(data, null, 2), "utf-8");
  }
}

export const skillsStore = new SkillsStore();
