/**
 * View Code Tool - ENABLED
 *
 * Purpose:
 * Fetches actual code from GitHub when the LLM needs implementation details
 * beyond what metadata provides.
 *
 * Security Design:
 * - Code is fetched live from GitHub (not from our DB)
 * - Raw code is returned to LLM for this conversation turn only
 * - Tool results are NOT stored in conversation history (_ephemeral flag)
 * - Code is discarded after the LLM processes it
 *
 * Cost:
 * Free (just GitHub API calls) - no summarization needed
 */

import { githubService } from "../domains/integrations/github/github.service.js";
import { db } from "../db/client.js";
import { integrations, githubRepos } from "../db/schema/index.js";
import { eq, and } from "drizzle-orm";

export interface ViewCodeParams {
  repoFullName?: string; // Optional - defaults to org's repo if only one exists
  defaultBranch?: string;

  // Mode 1: Single file
  filePath?: string;
  startLine?: number; // Optional - if omitted, fetch entire file
  endLine?: number;
  functionName?: string;

  // Mode 2: Multiple files (up to 4)
  files?: Array<{
    filePath: string;
    startLine?: number;
    endLine?: number;
  }>;
}

export interface ViewCodeContext {
  organizationId: string;
}

export class ViewCodeTool {
  async execute(params: ViewCodeParams, context: ViewCodeContext): Promise<any> {
    try {
      // Validate mode
      if (!params.filePath && !params.files) {
        throw new Error("Must provide either filePath or files array");
      }
      if (params.filePath && params.files) {
        throw new Error("Cannot provide both filePath and files - choose one mode");
      }
      if (params.files && params.files.length > 4) {
        throw new Error("Cannot fetch more than 4 files at once");
      }

      // 1. Get GitHub installation for this organization
      const [integration] = await db
        .select()
        .from(integrations)
        .where(
          and(
            eq(integrations.organizationId, context.organizationId),
            eq(integrations.provider, "github")
          )
        )
        .limit(1);

      if (!integration || !integration.metadata) {
        throw new Error("GitHub integration not found for this organization");
      }

      const metadata = integration.metadata as any;
      if (!metadata.installationId) {
        throw new Error("GitHub installation ID not found");
      }

      // 2. Resolve repoFullName if not provided
      let repoFullName = params.repoFullName;
      if (!repoFullName) {
        const repos = await db
          .select({ fullName: githubRepos.fullName })
          .from(githubRepos)
          .innerJoin(integrations, eq(githubRepos.integrationId, integrations.id))
          .where(eq(integrations.organizationId, context.organizationId))
          .limit(2); // Fetch 2 to detect multiple repos

        if (repos.length === 0) {
          throw new Error("No GitHub repos found for this organization");
        }
        if (repos.length > 1) {
          throw new Error(
            `Multiple repos found. Please specify repoFullName. Available: ${repos.map((r) => r.fullName).join(", ")}`
          );
        }
        repoFullName = repos[0].fullName;
      }

      // 3. Get authenticated Octokit instance
      const octokit = await githubService.getInstallationOctokit(metadata.installationId);

      // 4. Determine mode and fetch accordingly
      if (params.filePath) {
        // Mode 1: Single file
        const result = await this.fetchSingleFile(
          octokit,
          repoFullName,
          params.filePath,
          params.startLine,
          params.endLine,
          params.defaultBranch,
          params.functionName
        );
        return { ...result, _ephemeral: true };
      } else {
        // Mode 2: Multiple files
        const results = await Promise.all(
          params.files!.map((file) =>
            this.fetchSingleFile(
              octokit,
              repoFullName,
              file.filePath,
              file.startLine,
              file.endLine,
              params.defaultBranch
            )
          )
        );
        return { files: results, _ephemeral: true };
      }
    } catch (error) {
      console.error("[ViewCodeTool] Error:", error);
      throw new Error(
        `Failed to fetch code: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Helper: Fetch a single file from GitHub
   */
  private async fetchSingleFile(
    octokit: any,
    repoFullName: string,
    filePath: string,
    startLine?: number,
    endLine?: number,
    defaultBranch?: string,
    functionName?: string
  ): Promise<{
    file: string;
    function: string | undefined;
    lines: string | undefined;
    code: string;
  }> {
    const [owner, repo] = repoFullName.split("/");
    const branch = defaultBranch || "main";

    // Step 1: Get HEAD commit SHA for branch
    const { data: refData } = await octokit.request("GET /repos/{owner}/{repo}/git/ref/{ref}", {
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    const commitSha = refData.object.sha;

    // Step 2: Get commit to extract tree SHA
    const { data: commitData } = await octokit.request(
      "GET /repos/{owner}/{repo}/git/commits/{commit_sha}",
      {
        owner,
        repo,
        commit_sha: commitSha,
      }
    );
    const treeSha = commitData.tree.sha;

    // Step 3: Get entire repository tree (recursive)
    const { data: treeData } = await octokit.request(
      "GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
      {
        owner,
        repo,
        tree_sha: treeSha,
        recursive: "1", // Get all files
      }
    );

    // Step 4: Find our file in the tree
    const fileEntry = treeData.tree.find((entry: any) => entry.path === filePath);
    if (!fileEntry || fileEntry.type !== "blob") {
      throw new Error(`File not found in repository: ${filePath}`);
    }

    // Step 5: Fetch blob content using file SHA
    const { data: blobData } = await octokit.request(
      "GET /repos/{owner}/{repo}/git/blobs/{file_sha}",
      {
        owner,
        repo,
        file_sha: fileEntry.sha,
        mediaType: { format: "raw" },
      }
    );

    // Decode content
    const fullContent = typeof blobData === "string" ? blobData : String(blobData);
    const lines = fullContent.split("\n");

    // Extract specific lines or return entire file
    let code: string;
    let lineRange: string | undefined;

    if (startLine !== undefined && endLine !== undefined) {
      // Specific line range
      const codeLines = lines.slice(startLine - 1, endLine);
      code = codeLines.join("\n");
      lineRange = `${startLine}-${endLine}`;
    } else {
      // Entire file
      code = fullContent;
      lineRange = `1-${lines.length}`;
    }

    return {
      file: filePath,
      function: functionName,
      lines: lineRange,
      code,
    };
  }
}

export const viewCodeTool = new ViewCodeTool();
