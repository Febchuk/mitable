import { db } from "../db/client";
import { integrations } from "../db/schema";
import { githubRepos } from "../db/schema/github/github-repos.schema";
import { eq } from "drizzle-orm";
import { cacheService } from "./cache.service";

/**
 * Org Integration Context - describes what's connected for an organization
 * Used for smart query planning and filtering
 */
export interface OrgIntegrationContext {
  orgId: string;
  orgName?: string;
  integrations: {
    notion?: {
      connected: boolean;
      workspaceName?: string;
      integrationId?: string;
    };
    github?: {
      connected: boolean;
      repos: Array<{
        id: string;
        fullName: string;
        owner: string;
        name: string;
        isSelected: boolean;
      }>;
      orgReposConnected: string[]; // List of org-owned repo names
    };
    slack?: {
      connected: boolean;
      workspaceName?: string;
      integrationId?: string;
    };
  };
}

/**
 * Service for building org integration context with caching
 */
export class OrgContextService {
  private CACHE_TTL = 300; // 5 minutes
  private CACHE_PREFIX = "org-context:";

  /**
   * Get org integration context with caching
   */
  async getOrgContext(organizationId: string): Promise<OrgIntegrationContext> {
    // Check cache first
    const cacheKey = `${this.CACHE_PREFIX}${organizationId}`;
    const cached = cacheService.get<OrgIntegrationContext>(cacheKey);
    if (cached) {
      console.log(`[OrgContext] Cache hit for org ${organizationId}`);
      return cached;
    }

    console.log(`[OrgContext] Building context for org ${organizationId}...`);

    // Build fresh context
    const context = await this.buildOrgContext(organizationId);

    // Cache it
    cacheService.set(cacheKey, context, this.CACHE_TTL);
    console.log(`[OrgContext] Cached for ${this.CACHE_TTL}s`);

    return context;
  }

  /**
   * Invalidate cache when integrations change
   */
  invalidate(organizationId: string): void {
    const cacheKey = `${this.CACHE_PREFIX}${organizationId}`;
    cacheService.delete(cacheKey);
    console.log(`[OrgContext] Invalidated cache for org ${organizationId}`);
  }

  /**
   * Build org integration context from database
   */
  private async buildOrgContext(organizationId: string): Promise<OrgIntegrationContext> {
    const context: OrgIntegrationContext = {
      orgId: organizationId,
      integrations: {},
    };

    // Fetch all integrations for this org
    const orgIntegrations = await db
      .select()
      .from(integrations)
      .where(eq(integrations.organizationId, organizationId));

    // Process each integration by provider type
    for (const integration of orgIntegrations) {
      // Skip if not connected
      if (integration.status !== 'connected') continue;

      const metadata = (integration.metadata as any) || {};

      // Notion
      if (integration.provider === 'notion') {
        context.integrations.notion = {
          connected: true,
          workspaceName: metadata.workspaceName || metadata.workspace_name || undefined,
          integrationId: integration.id,
        };
      }

      // Slack
      else if (integration.provider === 'slack') {
        context.integrations.slack = {
          connected: true,
          workspaceName: metadata.workspaceName || metadata.workspace_name || undefined,
          integrationId: integration.id,
        };
      }

      // GitHub - fetch repos
      else if (integration.provider === 'github') {
        const repos = await db
          .select({
            id: githubRepos.id,
            fullName: githubRepos.fullName,
            owner: githubRepos.owner,
            name: githubRepos.name,
            isSelected: githubRepos.isSelected,
          })
          .from(githubRepos)
          .where(eq(githubRepos.integrationId, integration.id));

        // Filter to only selected repos
        const selectedRepos = repos.filter((r) => r.isSelected);
        const orgReposConnected = selectedRepos.map((r) => r.fullName);

        context.integrations.github = {
          connected: true,
          repos: repos.map((r) => ({
            id: r.id,
            fullName: r.fullName,
            owner: r.owner,
            name: r.name,
            isSelected: r.isSelected,
          })),
          orgReposConnected,
        };
      }
    }

    return context;
  }
}

// Export singleton
export const orgContextService = new OrgContextService();
