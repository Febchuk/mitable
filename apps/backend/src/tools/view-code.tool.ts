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

import { githubService } from "../services/github.service.js";
import { db } from "../db/client.js";
import { integrations } from "../db/schema/index.js";
import { eq, and } from "drizzle-orm";

export interface ViewCodeParams {
  repo_full_name: string;
  file_path: string;
  start_line: number;
  end_line: number;
  function_name?: string;
  default_branch?: string;
}

export interface ViewCodeContext {
  organizationId: string;
}

export class ViewCodeTool {
  async execute(
    params: ViewCodeParams,
    context: ViewCodeContext
  ): Promise<{
    file: string;
    function: string | undefined;
    lines: string;
    code: string; // Raw code content
    _ephemeral: boolean; // Flag to prevent persistence
  }> {
    try {
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

      // 2. Get authenticated Octokit instance using GitHub App
      const octokit = await githubService.getInstallationOctokit(metadata.installationId);

      // 3. Fetch code from GitHub using Git Data API (same as ingestion service)
      const [owner, repo] = params.repo_full_name.split("/");
      const branch = params.default_branch || "main";

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
      const fileEntry = treeData.tree.find((entry: any) => entry.path === params.file_path);
      if (!fileEntry || fileEntry.type !== "blob") {
        throw new Error(`File not found in repository: ${params.file_path}`);
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

      // Extract specific function/class lines
      const codeLines = lines.slice(params.start_line - 1, params.end_line);
      const code = codeLines.join("\n");

      // 2. Return raw code (no summarization needed per Febe's request)
      return {
        file: params.file_path,
        function: params.function_name,
        lines: `${params.start_line}-${params.end_line}`,
        code, // ← Raw code for LLM to read
        _ephemeral: true, // ← This flags the result as ephemeral (don't persist)
      };
    } catch (error) {
      console.error("[ViewCodeTool] Error:", error);
      throw new Error(
        `Failed to fetch code: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}
