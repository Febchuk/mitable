import { BaseTool, ToolContext, ToolResult, ToolParameters } from "./base.tool";
import { metaSearchService } from "../services/meta-search.service.js";

/**
 * MetaSearchTool - Multi-Domain Intelligent Search
 * 
 * This is the "orchestrator tool" that implements the full ChatGPT architecture:
 * 
 * 1. Analyzes the query
 * 2. Determines which domains to search (code, knowledge, work, docs)
 * 3. Rewrites the query for each domain
 * 4. Searches all domains in parallel
 * 5. Aggregates results into cohesive context
 * 6. Returns structured multi-domain answer
 * 
 * Examples:
 * - "How does authentication work?" → searches code + knowledge + docs
 * - "Where is the tray implemented?" → searches code only
 * - "What did we discuss about auth?" → searches knowledge only
 * - "Explain capture service" → searches code + knowledge
 * 
 * This replaces the need to choose between search_knowledge and search_codebase.
 * The system automatically determines what to search and how to search it.
 */
export class MetaSearchTool extends BaseTool {
  name = "meta_search";

  description = `Intelligent multi-domain search that automatically determines whether to search code, knowledge base, or both.
Use this for ANY information retrieval question. The system will:
- Analyze your query to understand intent
- Search relevant domains (codebase, Slack, Notion, docs)
- Rewrite queries per domain for optimal results
- Combine results into a cohesive answer

This is the primary search tool - it replaces manual choice between code/knowledge search.`;

  parameters: ToolParameters = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query - can be about code, discussions, decisions, or anything",
      },
      forceCode: {
        type: "boolean",
        description: "Force code search even if query doesn't seem code-related (optional)",
        default: false,
      },
      forceKnowledge: {
        type: "boolean",
        description: "Force knowledge search even if query doesn't seem discussion-related (optional)",
        default: false,
      },
      topK: {
        type: "number",
        description: "Number of results to return per domain (default: code=10, knowledge=20)",
        default: 10,
      },
    },
    required: ["query"],
  };

  async execute(
    args: {
      query: string;
      forceCode?: boolean;
      forceKnowledge?: boolean;
      topK?: number;
    },
    context: ToolContext
  ): Promise<ToolResult> {
    this.validate(args);

    const { query, forceCode = false, forceKnowledge = false, topK = 10 } = args;
    const organizationId = context.userProfile?.organizationId;

    console.log(`[MetaSearchTool] Query: "${query}"`, {
      organizationId,
      forceCode,
      forceKnowledge,
      topK,
    });

    try {
      if (!organizationId) {
        throw new Error("Organization ID not found in user context");
      }

      // Execute meta-search
      const result = await metaSearchService.search(
        query,
        { organizationId },
        { forceCode, forceKnowledge, topK }
      );

      console.log(`[MetaSearchTool] Classification:`, result.classification);
      console.log(`[MetaSearchTool] Domains searched:`, {
        code: !!result.results.code,
        work: !!result.results.work,
        slack: !!result.results.slack,
        notion: !!result.results.notion,
      });
      console.log(`[MetaSearchTool] Total sources: ${result.sources.length}`);
      console.log(`[MetaSearchTool] Total time: ${result.totalTime}ms`);

      // Check if we found anything
      const hasCodeResults = result.results.code && result.results.code.files.length > 0;
      const hasWorkResults = result.results.work && result.results.work.items.length > 0;
      const hasSlackResults = result.results.slack && result.results.slack.threads.length > 0;
      const hasNotionResults = result.results.notion && result.results.notion.pages.length > 0;

      if (!hasCodeResults && !hasWorkResults && !hasSlackResults && !hasNotionResults) {
        return {
          messageType: "text",
          content: `I couldn't find any relevant information for "${query}" in the connected repositories, Slack, or Notion.`,
          streamable: true,
        };
      }

      // Build summary of what was found
      const domainsSummary: string[] = [];
      if (hasCodeResults) {
        domainsSummary.push(
          `${result.results.code!.files.length} code files (${result.results.code!.totalChunks} chunks)`
        );
      }
      if (hasWorkResults) {
        domainsSummary.push(
          `${result.results.work!.items.length} work items`
        );
      }
      if (hasSlackResults) {
        domainsSummary.push(
          `${result.results.slack!.threads.length} Slack threads (${result.results.slack!.totalMessages} messages)`
        );
      }
      if (hasNotionResults) {
        domainsSummary.push(
          `${result.results.notion!.pages.length} Notion pages (${result.results.notion!.totalBlocks} blocks)`
        );
      }

      console.log(`[MetaSearchTool] Found: ${domainsSummary.join(', ')}`);

      // Add metadata header to help LLM understand what it's seeing
      const metadataHeader = `# Search Results for: "${query}"\n\n` +
        `**Domains Searched:** ${result.classification.domains.join(', ')}\n` +
        `**Primary Domain:** ${result.classification.primaryDomain || 'none'}\n` +
        `**Confidence:** ${(result.classification.confidence * 100).toFixed(0)}%\n` +
        `**Reasoning:** ${result.classification.reasoning}\n` +
        `**Results Found:** ${domainsSummary.join(', ')}\n\n` +
        `---\n\n`;

      const contentWithSources = metadataHeader + result.formattedContext;

      // Add sources list
      const sourcesText = result.sources
        .map((s, i) => `${i + 1}. [${s.domain}] ${s.title}`)
        .join("\n");

      const finalContent = `${contentWithSources}\n\n---\nAvailable sources:\n${sourcesText}`;

      return {
        messageType: "text",
        content: finalContent,
        sources: result.sources,
        streamable: true,
        metadata: {
          classification: result.classification,
          plan: result.plan,
          searchTime: result.totalTime,
          perDomainTimes: result.perDomainTimes,
          itemCount: result.items.length,
          domainsSearched: {
            code: hasCodeResults,
            work: hasWorkResults,
            slack: hasSlackResults,
            notion: hasNotionResults,
          },
          resultCounts: {
            code: result.results.code?.files.length || 0,
            work: result.results.work?.items.length || 0,
            slack: result.results.slack?.threads.length || 0,
            notion: result.results.notion?.pages.length || 0,
          },
        },
      };
    } catch (error) {
      console.error("[MetaSearchTool] Error during meta-search:", error);
      throw new Error("Failed to execute meta-search", { cause: error });
    }
  }
}
