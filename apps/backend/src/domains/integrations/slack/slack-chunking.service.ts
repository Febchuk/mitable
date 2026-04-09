/**
 * SlackChunkingService - Thread-aware intelligent chunking for Slack conversations
 *
 * Philosophy:
 * - The unit of meaning in Slack is: Workspace → Channel → Thread → Messages
 * - Not "1000 tokens" — but conversation structure
 *
 * Chunking Strategy:
 * 1. Group messages by thread_ts (conversation context)
 * 2. Create thread-aware chunks that preserve conversation flow
 * 3. Detect and preserve code blocks, logs, decisions
 * 4. Add rich metadata for filtering and boosting
 */

/**
 * Slack message from API (enriched with user info)
 */
export interface SlackMessage {
  ts: string;
  thread_ts?: string;
  user: string; // User ID (U05ABC123)
  user_name?: string; // Username (aurel)
  user_real_name?: string; // Real name (Aurel Febe) - PRIMARY
  text: string;
  channel: string;
  permalink?: string;
  reactions?: Array<{ name: string; count: number }>;
  files?: any[];
  attachments?: any[];
}

/**
 * Thread = group of messages
 */
export interface SlackThread {
  thread_id: string; // thread_ts or ts for root messages
  channel_id: string;
  channel_name: string;
  messages: SlackMessage[]; // Ordered by ts
  is_dm: boolean;
  is_group_dm: boolean;
}

/**
 * Chunk with structure-aware metadata
 */
export interface SlackChunk {
  // ===== CONTENT =====
  text: string; // What the model will see

  // ===== CONVERSATION STRUCTURE =====
  workspace_name: string;
  channel_id: string;
  channel_name: string;
  is_dm: boolean;
  is_group_dm: boolean;

  thread_id: string; // thread_ts or message_ts for root
  message_ids: string[]; // messages represented in this chunk
  is_thread_root: boolean;
  thread_start_ts: number;
  thread_end_ts: number;

  // ===== MESSAGE METADATA =====
  chunk_type: "thread_summary" | "message_window" | "code" | "log" | "text";
  authors: string[]; // Real names (e.g., "Aurel Febe", fallback to username or ID)
  mentioned_users: string[]; // User IDs mentioned in message (@mentions)
  has_code: boolean;
  code_language?: string; // "sql", "typescript", "python", etc.
  has_links: boolean;
  has_attachments: boolean;
  has_reactions: boolean;
  reaction_summary?: Record<string, number>; // 👍: 5, ✅: 3
  created_at: string; // earliest ts in this chunk

  // ===== CONTEXT FOR RANKING =====
  org_id: string;
  chunk_index: number;
  total_chunks: number;
}

/**
 * Configuration for chunking
 */
const CHUNK_CONFIG = {
  MESSAGE_WINDOW_SIZE: 5, // messages per window chunk
  MAX_TOKENS_PER_CHUNK: 800, // Target chunk size
  CODE_BLOCK_REGEX: /```[\s\S]*?```/g,
  INLINE_CODE_REGEX: /`[^`]+`/g,
} as const;

/**
 * SlackChunkingService - Thread-aware chunking
 */
class SlackChunkingService {
  /**
   * Main entry point: chunk Slack messages intelligently
   *
   * @param messages - Raw Slack messages from API
   * @param channel - Channel metadata
   * @param workspace - Workspace metadata
   * @returns Array of smart chunks
   */
  chunkSlackMessages(
    messages: SlackMessage[],
    channel: { id: string; name: string; is_dm?: boolean; is_group_dm?: boolean },
    workspace: { id: string; name: string }
  ): SlackChunk[] {
    if (messages.length === 0) return [];

    console.log(`[SlackChunking] Processing ${messages.length} messages from #${channel.name}`);

    // Step 1: Build threads from messages
    const threads = this.buildThreads(messages, channel);
    console.log(`[SlackChunking] Grouped into ${threads.length} thread(s)`);

    // Step 2: Generate chunks for each thread
    const allChunks: SlackChunk[] = [];

    for (const thread of threads) {
      const threadChunks = this.chunkThread(thread, workspace);
      allChunks.push(...threadChunks);
    }

    console.log(`[SlackChunking] Generated ${allChunks.length} total chunks`);

    return allChunks;
  }

  /**
   * Build threads from flat message list
   * Groups messages by thread_ts
   */
  private buildThreads(
    messages: SlackMessage[],
    channel: { id: string; name: string; is_dm?: boolean; is_group_dm?: boolean }
  ): SlackThread[] {
    const threadMap = new Map<string, SlackMessage[]>();

    // Group messages by thread
    for (const msg of messages) {
      const threadId = msg.thread_ts || msg.ts; // Root messages use their own ts
      const existing = threadMap.get(threadId) || [];
      existing.push(msg);
      threadMap.set(threadId, existing);
    }

    // Convert to SlackThread objects
    const threads: SlackThread[] = [];

    for (const [threadId, msgs] of threadMap.entries()) {
      // Sort by timestamp
      msgs.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));

      threads.push({
        thread_id: threadId,
        channel_id: channel.id,
        channel_name: channel.name,
        messages: msgs,
        is_dm: channel.is_dm || false,
        is_group_dm: channel.is_group_dm || false,
      });
    }

    return threads;
  }

  /**
   * Generate chunks for a single thread
   * Creates 2-3 types of chunks:
   * 1. Message window chunks (conversation flow)
   * 2. Code chunks (technical snippets)
   * 3. Thread summary (optional, future)
   */
  private chunkThread(thread: SlackThread, workspace: { id: string; name: string }): SlackChunk[] {
    const chunks: SlackChunk[] = [];

    // Detect code-heavy messages first
    const codeChunks = this.extractCodeChunks(thread, workspace);
    chunks.push(...codeChunks);

    // Create message window chunks for conversation flow
    const messageWindowChunks = this.createMessageWindowChunks(thread, workspace);
    chunks.push(...messageWindowChunks);

    // TODO: Future enhancement - thread summary chunk
    // const summaryChunk = await this.createThreadSummary(thread, workspace);
    // if (summaryChunk) chunks.push(summaryChunk);

    // Set chunk indices
    chunks.forEach((chunk, idx) => {
      chunk.chunk_index = idx;
      chunk.total_chunks = chunks.length;
    });

    return chunks;
  }

  /**
   * Extract code blocks as dedicated chunks
   * Handles: ```code blocks```, inline `code`, and multi-line logs
   */
  private extractCodeChunks(
    thread: SlackThread,
    workspace: { id: string; name: string }
  ): SlackChunk[] {
    const codeChunks: SlackChunk[] = [];

    for (const msg of thread.messages) {
      const codeBlocks = this.detectCodeBlocks(msg.text);

      if (codeBlocks.length === 0) continue;

      for (const block of codeBlocks) {
        // Build context-aware text
        const contextHeader = `[${workspace.name} • #${thread.channel_name} • Thread]\n`;
        const messageContext = `@${msg.user}:\n${block.code}`;

        const chunkText = contextHeader + messageContext;

        codeChunks.push({
          text: chunkText,
          workspace_name: workspace.name,
          channel_id: thread.channel_id,
          channel_name: thread.channel_name,
          is_dm: thread.is_dm,
          is_group_dm: thread.is_group_dm,
          thread_id: thread.thread_id,
          message_ids: [msg.ts],
          is_thread_root: msg.ts === thread.thread_id,
          thread_start_ts: parseFloat(msg.ts),
          thread_end_ts: parseFloat(msg.ts),
          chunk_type: block.language === "log" ? "log" : "code",
          authors: [msg.user_real_name || msg.user_name || msg.user],
          mentioned_users: this.extractMentions(msg.text),
          has_code: true,
          code_language: block.language,
          has_links: this.hasLinks(msg.text),
          has_attachments: (msg.files?.length || 0) > 0 || (msg.attachments?.length || 0) > 0,
          has_reactions: (msg.reactions?.length || 0) > 0,
          reaction_summary: this.buildReactionSummary(msg.reactions),
          created_at: new Date(parseFloat(msg.ts) * 1000).toISOString(),
          org_id: workspace.id,
          chunk_index: 0,
          total_chunks: 0,
        });
      }
    }

    return codeChunks;
  }

  /**
   * Create message window chunks (sliding window over conversation)
   * Groups 3-6 messages per chunk, preserving conversational flow
   */
  private createMessageWindowChunks(
    thread: SlackThread,
    workspace: { id: string; name: string }
  ): SlackChunk[] {
    const chunks: SlackChunk[] = [];
    const windowSize = CHUNK_CONFIG.MESSAGE_WINDOW_SIZE;

    // Always include root message in first chunk
    let i = 0;

    while (i < thread.messages.length) {
      const windowMsgs = thread.messages.slice(i, i + windowSize);
      const chunkText = this.formatMessageWindow(windowMsgs, thread, workspace);

      // Skip if too small (e.g., only reactions, no text)
      if (chunkText.trim().length < 50) {
        i += windowSize;
        continue;
      }

      const allAuthors = [
        ...new Set(windowMsgs.map((m) => m.user_real_name || m.user_name || m.user)),
      ];
      const allMentions = windowMsgs.flatMap((m) => this.extractMentions(m.text));
      const hasCode = windowMsgs.some((m) => this.hasCodeBlocks(m.text));
      const hasLinks = windowMsgs.some((m) => this.hasLinks(m.text));
      const hasAttachments = windowMsgs.some(
        (m) => (m.files?.length || 0) > 0 || (m.attachments?.length || 0) > 0
      );
      const hasReactions = windowMsgs.some((m) => (m.reactions?.length || 0) > 0);

      chunks.push({
        text: chunkText,
        workspace_name: workspace.name,
        channel_id: thread.channel_id,
        channel_name: thread.channel_name,
        is_dm: thread.is_dm,
        is_group_dm: thread.is_group_dm,
        thread_id: thread.thread_id,
        message_ids: windowMsgs.map((m) => m.ts),
        is_thread_root: windowMsgs[0].ts === thread.thread_id,
        thread_start_ts: parseFloat(windowMsgs[0].ts),
        thread_end_ts: parseFloat(windowMsgs[windowMsgs.length - 1].ts),
        chunk_type: "message_window",
        authors: allAuthors,
        mentioned_users: [...new Set(allMentions)],
        has_code: hasCode,
        code_language: hasCode ? this.detectCodeLanguage(windowMsgs) : undefined,
        has_links: hasLinks,
        has_attachments: hasAttachments,
        has_reactions: hasReactions,
        reaction_summary: this.aggregateReactions(windowMsgs),
        created_at: new Date(parseFloat(windowMsgs[0].ts) * 1000).toISOString(),
        org_id: workspace.id,
        chunk_index: 0,
        total_chunks: 0,
      });

      i += windowSize;
    }

    return chunks;
  }

  /**
   * Format message window with context header
   */
  private formatMessageWindow(
    messages: SlackMessage[],
    thread: SlackThread,
    workspace: { id: string; name: string }
  ): string {
    const date = new Date(parseFloat(messages[0].ts) * 1000).toISOString().split("T")[0];
    const contextHeader = `[${workspace.name} • #${thread.channel_name} • ${date} • Thread]\n\n`;

    const messageTexts = messages.map((msg) => {
      const timestamp = new Date(parseFloat(msg.ts) * 1000).toLocaleTimeString();
      const displayName = msg.user_real_name || msg.user_name || msg.user;
      return `${displayName} [${timestamp}]: ${msg.text}`;
    });

    return contextHeader + messageTexts.join("\n");
  }

  /**
   * Detect code blocks in message text
   * Returns: array of {code, language}
   */
  private detectCodeBlocks(text: string): Array<{ code: string; language: string }> {
    const blocks: Array<{ code: string; language: string }> = [];

    // Match ```lang\ncode\n```
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      const language = match[1] || "unknown";
      const code = match[2].trim();

      // Detect if it looks like a log (no specific language marker)
      const isLog =
        !match[1] && (code.includes("ERROR") || code.includes("WARN") || code.includes("["));

      blocks.push({
        code: match[0], // Full block with ```
        language: isLog ? "log" : language,
      });
    }

    return blocks;
  }

  /**
   * Check if text has code blocks
   */
  private hasCodeBlocks(text: string): boolean {
    return CHUNK_CONFIG.CODE_BLOCK_REGEX.test(text) || CHUNK_CONFIG.INLINE_CODE_REGEX.test(text);
  }

  /**
   * Detect code language from multiple messages
   */
  private detectCodeLanguage(messages: SlackMessage[]): string | undefined {
    for (const msg of messages) {
      const blocks = this.detectCodeBlocks(msg.text);
      if (blocks.length > 0 && blocks[0].language !== "unknown") {
        return blocks[0].language;
      }
    }
    return undefined;
  }

  /**
   * Check if text has links
   */
  private hasLinks(text: string): boolean {
    return /<https?:\/\/[^\s>]+>/g.test(text) || /https?:\/\/[^\s]+/.test(text);
  }

  /**
   * Extract @mentions from text
   */
  private extractMentions(text: string): string[] {
    const mentions: string[] = [];
    const mentionRegex = /<@(\w+)>/g;
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
      mentions.push(match[1]);
    }

    return mentions;
  }

  /**
   * Build reaction summary for a single message
   */
  private buildReactionSummary(
    reactions?: Array<{ name: string; count: number }>
  ): Record<string, number> | undefined {
    if (!reactions || reactions.length === 0) return undefined;

    const summary: Record<string, number> = {};
    for (const reaction of reactions) {
      summary[reaction.name] = reaction.count;
    }

    return summary;
  }

  /**
   * Aggregate reactions across multiple messages
   */
  private aggregateReactions(messages: SlackMessage[]): Record<string, number> | undefined {
    const aggregated: Record<string, number> = {};

    for (const msg of messages) {
      if (msg.reactions) {
        for (const reaction of msg.reactions) {
          aggregated[reaction.name] = (aggregated[reaction.name] || 0) + reaction.count;
        }
      }
    }

    return Object.keys(aggregated).length > 0 ? aggregated : undefined;
  }
}

export const slackChunkingService = new SlackChunkingService();
