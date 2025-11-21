/**
 * MetaSearchService - Multi-Domain Search Coordinator
 * 
 * Architecture based on ChatGPT's recommendations:
 * 
 * 1. Classify query → determine which domains to search (code, slack, notion)
 * 2. Build retrieval plan → separate "what" from "how"
 * 3. Execute retrievers in parallel (with timeouts + error handling)
 * 4. Convert to structured items (for analytics/debugging)
 * 5. Format for LLM consumption
 * 
 * Key principles:
 * - Keep classification separate from retrievers
 * - Make retrievers dumb and explicit
 * - Don't throw away structure too early
 * - Guard against "run everything all the time"
 * - Handle partial failures gracefully
 */

import { codeRetriever, type CodeFile } from "../retrievers/code.retriever.js";
import { workRetriever, type WorkItem } from "../retrievers/work.retriever.js";
import { slackRetriever, type SlackThread } from "../retrievers/slack.retriever.js";
import { notionRetriever, type NotionPage } from "../retrievers/notion.retriever.js";

/**
 * ============================================
 * TYPES
 * ============================================
 */

export type Domain = 'code' | 'work' | 'slack' | 'notion';

export interface MetaSearchContext {
  organizationId: string;
  repoId?: string;
  repoFullName?: string;
}

/**
 * Structured result item (keeps metadata for analytics)
 */
export interface MetaSearchResultItem {
  id: string;
  domain: Domain;
  source: string;
  score: number;
  title?: string;
  snippet: string;
  url?: string;
  metadata: Record<string, any>;
}

/**
 * Classification: which domains + why
 */
export interface DomainClassification {
  domains: Domain[];
  primaryDomain: Domain | null;
  confidence: number;
  reasoning: string;
}

/**
 * Retrieval plan: separates "what to search" from "how to search"
 */
export interface RetrievalPlan {
  domains: Domain[];
  rewrittenQueries: Partial<Record<Domain, string>>;
  originalQuery: string;
  perDomainConfig: Partial<Record<Domain, { topK: number; timeout: number }>>;
}

/**
 * Per-domain raw results
 */
export interface DomainResults {
  code?: {
    files: CodeFile[];
    totalChunks: number;
    searchTime: number;
  };
  work?: {
    items: WorkItem[];
    totalItems: number;
    searchTime: number;
  };
  slack?: {
    threads: SlackThread[];
    totalMessages: number;
    searchTime: number;
  };
  notion?: {
    pages: NotionPage[];
    totalBlocks: number;
    searchTime: number;
  };
}

/**
 * Final response
 */
export interface MetaSearchResult {
  query: string;
  plan: RetrievalPlan;
  classification: DomainClassification;
  results: DomainResults;
  items: MetaSearchResultItem[];
  totalTime: number;
  formattedContext: string;
  sources: Array<{ title: string; url: string; snippet: string; domain: string }>;
  perDomainTimes: Partial<Record<Domain, number>>;
}

/**
 * ============================================
 * SERVICE
 * ============================================
 */

export class MetaSearchService {
  // Domain-specific config (explicit and debuggable)
  private readonly DOMAIN_CONFIG = {
    code: { topK: 10, timeout: 8000 },    // 8s timeout
    work: { topK: 8, timeout: 5000 },     // 5s timeout (fast - just metadata)
    slack: { topK: 20, timeout: 10000 },  // 10s timeout (thread expansion can be slow)
    notion: { topK: 15, timeout: 8000 },  // 8s timeout
  };

  /**
   * Main entry point
   */
  async search(
    query: string,
    context: MetaSearchContext,
    options: {
      forceCode?: boolean;
      forceKnowledge?: boolean;
      topK?: number;
    } = {}
  ): Promise<MetaSearchResult> {
    const startTime = Date.now();
    
    console.log(`[MetaSearch] Query: "${query}"`);
    
    // Step 1: Classify query
    const classification = this.classifyQuery(query, options);
    console.log(`[MetaSearch] Classification:`, {
      domains: classification.domains,
      primary: classification.primaryDomain,
      confidence: classification.confidence,
      reasoning: classification.reasoning,
    });
    
    // Step 2: Build retrieval plan
    const plan = this.buildRetrievalPlan(query, classification, options);
    console.log(`[MetaSearch] Plan:`, {
      domains: plan.domains,
      queries: Object.keys(plan.rewrittenQueries),
    });
    
    // Step 3: Execute parallel searches (with timeouts)
    const { results, perDomainTimes } = await this.executeParallelSearch(plan, context);
    
    // Step 4: Convert to structured items
    const items = this.convertToItems(results);
    
    // Step 5: Format for LLM
    const { formattedContext, sources } = this.formatResults(results);
    
    const totalTime = Date.now() - startTime;
    
    // Pipeline logging
    console.log(`[MetaSearch] Complete in ${totalTime}ms`);
    console.log(`[MetaSearch] Per-domain times:`, perDomainTimes);
    console.log(`[MetaSearch] Items: ${items.length}, Sources: ${sources.length}`);
    
    return {
      query,
      plan,
      classification,
      results,
      items,
      totalTime,
      formattedContext,
      sources,
      perDomainTimes,
    };
  }

  /**
   * Step 1: Classify query (smart pruning to avoid "search all")
   */
  private classifyQuery(
    query: string,
    options: { forceCode?: boolean; forceKnowledge?: boolean }
  ): DomainClassification {
    const queryLower = query.toLowerCase();
    
    // Keyword indicators
    const codeKeywords = [
      'implement', 'code', 'function', 'class', 'method', 'file',
      'typescript', 'javascript', 'where is', 'show me the', 'error', 'bug',
      'repo', 'repository', 'github', 'codebase'
    ];
    
    const workKeywords = [
      'commit', 'commits', 'committed', 'latest commit', 'recent commit',
      'pull request', 'pr', 'prs', 'merge', 'merged',
      'issue', 'issues', 'bug report', 'feature request'
    ];
    
    const slackKeywords = [
      'discuss', 'talked about', 'decided', 'decision', 'who worked',
      'team', 'meeting', 'thread', 'when did', 'recently', 'channel'
    ];
    
    const notionKeywords = [
      'documentation', 'policy', 'process', 'workflow', 'spec',
      'requirements', 'architecture', 'design', 'guide', 'guideline'
    ];
    
    const hybridKeywords = ['how does', 'explain', 'understand', 'why'];
    
    const hasCode = codeKeywords.some(k => queryLower.includes(k));
    const hasWork = workKeywords.some(k => queryLower.includes(k));
    const hasSlack = slackKeywords.some(k => queryLower.includes(k));
    const hasNotion = notionKeywords.some(k => queryLower.includes(k));
    const hasHybrid = hybridKeywords.some(k => queryLower.includes(k));
    
    // Build domains array
    const domains: Domain[] = [];
    let primaryDomain: Domain | null = null;
    let confidence = 0.7;
    let reasoning = '';
    
    // Force flags override
    if (options.forceCode) {
      domains.push('code');
      primaryDomain = 'code';
      confidence = 1.0;
      reasoning = 'Forced code search';
    }
    
    if (options.forceKnowledge) {
      if (!domains.includes('slack')) domains.push('slack');
      if (!domains.includes('notion')) domains.push('notion');
      if (!primaryDomain) primaryDomain = 'slack';
      confidence = 1.0;
      reasoning = 'Forced knowledge search';
    }
    
    // Heuristic classification (FAVOR MULTI-DOMAIN for better coverage)
    if (domains.length === 0) {
      if (hasHybrid) {
        // Hybrid: search all
        domains.push('code', 'work', 'slack', 'notion');
        primaryDomain = 'code';
        confidence = 0.85;
        reasoning = 'Hybrid query (how/why/explain) - needs multiple sources';
      } else if (hasWork) {
        // Work queries are most specific (commits/PRs/issues) - check FIRST
        domains.push('work');
        if (hasCode) domains.push('code'); // Also check code for context
        primaryDomain = 'work';
        confidence = 0.85;
        reasoning = 'Work-focused query (commits/PRs/issues)';
      } else if (hasCode && (hasSlack || hasNotion)) {
        // Code + knowledge
        domains.push('code');
        if (hasSlack) domains.push('slack');
        if (hasNotion) domains.push('notion');
        primaryDomain = 'code';
        confidence = 0.9;
        reasoning = 'Code + discussion/docs query';
      } else if (hasCode) {
        // Code queries often benefit from docs too (e.g., "how does X work in the repo?")
        domains.push('code', 'notion');
        primaryDomain = 'code';
        confidence = 0.75;
        reasoning = 'Code-focused query (also checking docs for context)';
      } else if (hasSlack && hasNotion) {
        // Both knowledge sources
        domains.push('slack', 'notion');
        primaryDomain = 'slack';
        confidence = 0.8;
        reasoning = 'Discussion + documentation query';
      } else if (hasSlack) {
        // Slack only (unless it's process/how-to, then also check docs)
        domains.push('slack');
        if (hasHybrid || /\b(process|workflow|how to|guide)\b/i.test(query)) {
          domains.push('notion');
        }
        primaryDomain = 'slack';
        confidence = 0.8;
        reasoning = hasHybrid ? 'Conversation + potential docs' : 'Conversation-focused query';
      } else if (hasNotion) {
        // Notion queries might also need code examples
        domains.push('notion');
        if (hasHybrid || /\b(implement|example|work)\b/i.test(query)) {
          domains.push('code');
        }
        primaryDomain = 'notion';
        confidence = 0.8;
        reasoning = hasHybrid ? 'Documentation + potential code' : 'Documentation-focused query';
      } else {
        // Ambiguous - search ALL to avoid misses (better to over-search than miss results)
        domains.push('code', 'slack', 'notion');
        primaryDomain = null;
        confidence = 0.5;
        reasoning = 'Ambiguous query - searching all domains for coverage';
      }
    }
    
    return { domains, primaryDomain, confidence, reasoning };
  }

  /**
   * Step 2: Build retrieval plan (separates what from how)
   */
  private buildRetrievalPlan(
    query: string,
    classification: DomainClassification,
    options: { topK?: number }
  ): RetrievalPlan {
    const rewrittenQueries: Partial<Record<Domain, string>> = {};
    const perDomainConfig: Partial<Record<Domain, { topK: number; timeout: number }>> = {};
    
    // Rewrite query per domain
    for (const domain of classification.domains) {
      if (domain === 'code') {
        rewrittenQueries.code = this.rewriteForCode(query);
        perDomainConfig.code = {
          topK: options.topK || this.DOMAIN_CONFIG.code.topK,
          timeout: this.DOMAIN_CONFIG.code.timeout,
        };
      } else if (domain === 'work') {
        rewrittenQueries.work = query; // No rewriting for work - keep it simple
        perDomainConfig.work = {
          topK: options.topK || this.DOMAIN_CONFIG.work.topK,
          timeout: this.DOMAIN_CONFIG.work.timeout,
        };
      } else if (domain === 'slack') {
        rewrittenQueries.slack = this.rewriteForSlack(query);
        perDomainConfig.slack = {
          topK: options.topK || this.DOMAIN_CONFIG.slack.topK,
          timeout: this.DOMAIN_CONFIG.slack.timeout,
        };
      } else if (domain === 'notion') {
        rewrittenQueries.notion = this.rewriteForNotion(query);
        perDomainConfig.notion = {
          topK: options.topK || this.DOMAIN_CONFIG.notion.topK,
          timeout: this.DOMAIN_CONFIG.notion.timeout,
        };
      }
    }
    
    return {
      domains: classification.domains,
      rewrittenQueries,
      originalQuery: query,
      perDomainConfig,
    };
  }

  /**
   * Query rewriting: Code (technical)
   */
  private rewriteForCode(query: string): string {
    let rewritten = query;
    
    const expansions: Record<string, string> = {
      'auth': 'authentication AuthService login JWT token session',
      'database': 'database db postgres drizzle query schema',
      'api': 'api route endpoint handler controller service',
    };
    
    Object.entries(expansions).forEach(([term, expansion]) => {
      const regex = new RegExp(`\\b${term}\\b`, 'i');
      if (regex.test(rewritten)) {
        rewritten = rewritten.replace(regex, expansion);
      }
    });
    
    if (/\b(how|work|implement)\b/i.test(query)) {
      rewritten += ' implementation method function class';
    }
    
    if (/\b(where|find|locate)\b/i.test(query)) {
      rewritten += ' file path src service';
    }
    
    rewritten = rewritten
      .replace(/\b(show me|find the)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    return rewritten;
  }

  /**
   * Query rewriting: Slack (conversational)
   */
  private rewriteForSlack(query: string): string {
    let rewritten = query;
    const terms: string[] = [];
    
    if (/\b(who|person|team|worked)\b/i.test(query)) {
      terms.push('team', 'worked', 'assigned');
    }
    
    if (/\b(when|recently|last|ago)\b/i.test(query)) {
      terms.push('discussed', 'mentioned');
    }
    
    if (/\b(why|reason|decision)\b/i.test(query)) {
      terms.push('decision', 'because', 'decided');
    }
    
    if (!/\b(discuss|conversation|thread)\b/i.test(query)) {
      terms.push('discussion', 'conversation');
    }
    
    if (terms.length > 0) {
      rewritten += ' ' + terms.join(' ');
    }
    
    return rewritten.trim();
  }

  /**
   * Query rewriting: Notion (formal docs)
   */
  private rewriteForNotion(query: string): string {
    let rewritten = query;
    const terms: string[] = [];
    
    if (/\b(architecture|design|pattern)\b/i.test(query)) {
      terms.push('architecture', 'design', 'system', 'overview');
    }
    
    if (/\b(process|workflow|how to)\b/i.test(query)) {
      terms.push('guide', 'process', 'workflow', 'steps');
    }
    
    if (!/\b(documentation|guide)\b/i.test(query)) {
      terms.push('documentation', 'guide');
    }
    
    if (terms.length > 0) {
      rewritten += ' ' + terms.join(' ');
    }
    
    return rewritten.trim();
  }

  /**
   * Step 3: Execute parallel searches (with timeouts + error handling)
   */
  private async executeParallelSearch(
    plan: RetrievalPlan,
    context: MetaSearchContext
  ): Promise<{ results: DomainResults; perDomainTimes: Partial<Record<Domain, number>> }> {
    const searches: Promise<{ domain: Domain; result: any; time: number } | null>[] = [];
    const results: DomainResults = {};
    const perDomainTimes: Partial<Record<Domain, number>> = {};
    
    // Launch searches with individual timeouts
    for (const domain of plan.domains) {
      const config = plan.perDomainConfig[domain];
      if (!config) continue;
      
      const query = plan.rewrittenQueries[domain];
      if (!query) continue;
      
      if (domain === 'code') {
        // Search ALL GitHub content by default (code, commits, PRs, issues)
        const includeTypes: ("code" | "commit" | "pr" | "issue")[] = ['code', 'commit', 'pr', 'issue'];
        
        searches.push(
          this.withTimeout(
            async () => {
              const start = Date.now();
              const result = await codeRetriever.retrieve(query, context, { 
                topK: config.topK,
                includeTypes 
              });
              return { domain: 'code' as Domain, result, time: Date.now() - start };
            },
            config.timeout,
            domain
          )
        );
      } else if (domain === 'work') {
        searches.push(
          this.withTimeout(
            async () => {
              const start = Date.now();
              const result = await workRetriever.retrieve(query, context, { topK: config.topK });
              return { domain: 'work' as Domain, result, time: Date.now() - start };
            },
            config.timeout,
            domain
          )
        );
      } else if (domain === 'slack') {
        searches.push(
          this.withTimeout(
            async () => {
              const start = Date.now();
              const result = await slackRetriever.retrieve(query, context, { topK: config.topK });
              return { domain: 'slack' as Domain, result, time: Date.now() - start };
            },
            config.timeout,
            domain
          )
        );
      } else if (domain === 'notion') {
        searches.push(
          this.withTimeout(
            async () => {
              const start = Date.now();
              const result = await notionRetriever.retrieve(query, context, { topK: config.topK });
              return { domain: 'notion' as Domain, result, time: Date.now() - start };
            },
            config.timeout,
            domain
          )
        );
      }
    }
    
    // Wait for all (or timeout)
    const completed = await Promise.all(searches);
    
    // Organize results
    completed.forEach(item => {
      if (!item) return;
      
      const { domain, result, time } = item;
      perDomainTimes[domain] = time;
      
      if (result) {
        if (domain === 'code') {
          results.code = result;
        } else if (domain === 'work') {
          results.work = result;
        } else if (domain === 'slack') {
          results.slack = result;
        } else if (domain === 'notion') {
          results.notion = result;
        }
      }
    });
    
    return { results, perDomainTimes };
  }

  /**
   * Timeout wrapper for individual domain searches
   */
  private async withTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    domain: Domain
  ): Promise<T | null> {
    return Promise.race([
      fn(),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error(`${domain} search timeout`)), timeoutMs)
      ),
    ]).catch(err => {
      console.error(`[MetaSearch] ${domain} search failed:`, err.message);
      return null;
    });
  }

  /**
   * Step 4: Convert to structured items (for analytics)
   */
  private convertToItems(results: DomainResults): MetaSearchResultItem[] {
    const items: MetaSearchResultItem[] = [];
    
    // Code items
    if (results.code) {
      for (const file of results.code.files) {
        for (const chunk of file.chunks) {
          items.push({
            id: `code-${file.path}-${chunk.startLine}`,
            domain: 'code',
            source: 'github',
            score: chunk.score,
            title: `${file.fileName}:${chunk.startLine}-${chunk.endLine}`,
            snippet: chunk.text.substring(0, 200),
            url: `#${file.path}:${chunk.startLine}`,
            metadata: {
              path: file.path,
              language: file.language,
              area: file.area,
              startLine: chunk.startLine,
              endLine: chunk.endLine,
            },
          });
        }
      }
    }
    
    // Work items (commits, PRs, issues)
    if (results.work) {
      for (const item of results.work.items) {
        items.push({
          id: `work-${item.type}-${item.id}`,
          domain: 'work',
          source: 'github',
          score: item.score,
          title: item.title,
          snippet: item.description.substring(0, 200),
          url: item.url || '#',
          metadata: {
            type: item.type,
            author: item.author,
            createdAt: item.createdAt,
            repoFullName: item.repoFullName,
            commitSha: item.commitSha,
            prNumber: item.prNumber,
            issueNumber: item.issueNumber,
          },
        });
      }
    }
    
    // Slack items
    if (results.slack) {
      for (const thread of results.slack.threads) {
        for (const msg of thread.messages) {
          items.push({
            id: `slack-${msg.messageTs}`,
            domain: 'slack',
            source: 'slack',
            score: msg.score,
            title: `#${thread.channelName} - ${msg.username}`,
            snippet: msg.text.substring(0, 200),
            url: msg.messageUrl || '#',
            metadata: {
              channelId: thread.channelId,
              channelName: thread.channelName,
              username: msg.username,
              timestamp: msg.timestamp,
            },
          });
        }
      }
    }
    
    // Notion items
    if (results.notion) {
      for (const page of results.notion.pages) {
        for (const block of page.blocks) {
          items.push({
            id: `notion-${block.blockId}`,
            domain: 'notion',
            source: 'notion',
            score: block.score,
            title: `${page.pageTitle} (${block.blockType})`,
            snippet: block.text.substring(0, 200),
            url: page.pageUrl || '#',
            metadata: {
              pageId: page.pageId,
              pageTitle: page.pageTitle,
              blockId: block.blockId,
              blockType: block.blockType,
            },
          });
        }
      }
    }
    
    return items;
  }

  /**
   * Step 5: Format for LLM (per-domain helpers)
   */
  private formatResults(
    results: DomainResults
  ): { formattedContext: string; sources: Array<{ title: string; url: string; snippet: string; domain: string; metadata?: any }> } {
    const parts: string[] = [];
    const sources: Array<{ title: string; url: string; snippet: string; domain: string; metadata?: any }> = [];
    
    // Code
    if (results.code && results.code.files.length > 0) {
      const codeSection = this.formatCodeSection(results.code, sources);
      parts.push(codeSection);
    }
    
    // Work (commits, PRs, issues)
    if (results.work && results.work.items.length > 0) {
      const workSection = this.formatWorkSection(results.work, sources);
      parts.push(workSection);
    }
    
    // Slack
    if (results.slack && results.slack.threads.length > 0) {
      const slackSection = this.formatSlackSection(results.slack, sources);
      parts.push(slackSection);
    }
    
    // Notion
    if (results.notion && results.notion.pages.length > 0) {
      const notionSection = this.formatNotionSection(results.notion, sources);
      parts.push(notionSection);
    }
    
    const formattedContext = parts.join('\n\n');
    
    return { formattedContext, sources };
  }

  private formatWorkSection(
    workResults: { items: WorkItem[] },
    sources: Array<{ title: string; url: string; snippet: string; domain: string; metadata?: any }>
  ): string {
    const parts = ['=== DEVELOPMENT ACTIVITY ===\n'];
    
    for (const item of workResults.items.slice(0, 8)) {
      const typeLabel = item.type === 'commit' ? '📝 Commit' : item.type === 'pr' ? '🔀 Pull Request' : '🐛 Issue';
      parts.push(`\n## ${typeLabel}: ${item.title}`);
      parts.push(`Author: ${item.author} | ${item.createdAt.toLocaleDateString()}`);
      
      if (item.description) {
        // For single items (like "latest" queries), show full description
        // For multiple items, truncate to avoid overwhelming the LLM
        const maxLength = workResults.items.length === 1 ? 2000 : 300;
        parts.push(item.description.substring(0, maxLength));
      }
      
      sources.push({
        title: `${item.type}: ${item.title}`,
        url: item.url || '',
        snippet: item.description.substring(0, 150),
        domain: 'work',
        metadata: {
          type: item.type,
          author: item.author,
          createdAt: item.createdAt,
          commitSha: item.commitSha,
          prNumber: item.prNumber,
          issueNumber: item.issueNumber,
        },
      });
    }
    
    return parts.join('\n');
  }

  private formatCodeSection(
    codeResults: { files: CodeFile[] },
    sources: Array<{ title: string; url: string; snippet: string; domain: string; metadata?: any }>
  ): string {
    const parts = ['=== CODE IMPLEMENTATION ===\n'];
    
    for (const file of codeResults.files.slice(0, 5)) {
      parts.push(`\n## ${file.path} (${file.language})`);
      
      for (const chunk of file.chunks.slice(0, 2)) {
        parts.push(`\nLines ${chunk.startLine}-${chunk.endLine}:`);
        parts.push(chunk.text);
        
        sources.push({
          title: `${file.path}:${chunk.startLine}-${chunk.endLine}`,
          url: '', // No URL needed for code - it's a file path reference
          snippet: chunk.text.substring(0, 150),
          domain: 'code',
        });
      }
    }
    
    return parts.join('\n');
  }

  private formatSlackSection(
    slackResults: { threads: SlackThread[] },
    sources: Array<{ title: string; url: string; snippet: string; domain: string; metadata?: any }>
  ): string {
    const parts = ['=== SLACK DISCUSSIONS ===\n'];
    
    for (const thread of slackResults.threads.slice(0, 6)) {
      parts.push(`\n[#${thread.channelName}]`);
      
      for (const msg of thread.messages.slice(0, 5)) {
        parts.push(`${msg.username}: ${msg.text}`);
        
        sources.push({
          title: `#${thread.channelName} - ${msg.username}`,
          url: msg.messageUrl || '#',
          snippet: msg.text.substring(0, 150),
          domain: 'slack',
        });
      }
    }
    
    return parts.join('\n');
  }

  private formatNotionSection(
    notionResults: { pages: NotionPage[] },
    sources: Array<{ title: string; url: string; snippet: string; domain: string; metadata?: any }>
  ): string {
    const parts = ['=== NOTION DOCUMENTATION ===\n'];
    
    for (const page of notionResults.pages.slice(0, 5)) {
      parts.push(`\n## ${page.pageTitle}`);
      
      for (const block of page.blocks.slice(0, 3)) {
        parts.push(`[${block.blockType}]: ${block.text}`);
        
        if (page.pageUrl) {
          sources.push({
            title: `${page.pageTitle}`,
            url: page.pageUrl,
            snippet: block.text.substring(0, 150),
            domain: 'notion',
          });
        }
      }
    }
    
    return parts.join('\n');
  }
}

export const metaSearchService = new MetaSearchService();
