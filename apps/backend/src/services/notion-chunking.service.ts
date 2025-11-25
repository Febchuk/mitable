import { get_encoding } from "tiktoken";

/**
 * Notion-Specific Chunking Service
 * 
 * Strategy:
 * 1. Parse Notion blocks into hierarchical sections based on headings
 * 2. Keep code blocks, tables, and callouts intact (never split them)
 * 3. Add section context to every chunk (heading path)
 * 4. Rich metadata for smart filtering (chunk_type, has_code, section_path)
 * 
 * This replaces generic token-based chunking with structure-aware chunking
 * optimized for technical documentation and mixed content types.
 */

export interface NotionBlock {
  id: string;
  type: string;
  text: string;
  parent_id?: string;
  has_children?: boolean;
}

export interface NotionSection {
  section_id: string;
  section_path: string[];  // ["Parent Section", "Child Section"]
  section_title: string;
  heading_level: 1 | 2 | 3 | null;
  blocks: NotionBlock[];
}

export interface NotionChunk {
  text: string;
  tokenCount: number;
  
  // Section context (universal structure)
  section_path: string[];
  section_title: string;
  section_id: string;
  heading_level: 1 | 2 | 3 | null;
  
  // Block classification
  chunk_type: "code" | "table" | "list" | "text" | "callout" | "quote";
  has_code: boolean;
  has_table: boolean;
  has_list: boolean;
  
  // Code-specific metadata
  code_language?: string;
  
  // Block IDs for traceability
  block_ids: string[];
  
  // Chunk metadata
  chunkIndex: number;
  totalChunks: number;
}

const CHUNK_CONFIG = {
  MAX_TOKENS: 600,        // Target chunk size
  CODE_MAX_TOKENS: 1500,  // Larger chunks for code (keep together)
  MIN_TOKENS: 200,        // Minimum viable chunk
} as const;

class NotionChunkingService {
  private encoding;
  
  constructor() {
    this.encoding = get_encoding("cl100k_base");
  }
  
  /**
   * Count tokens in text
   */
  private countTokens(text: string): number {
    return this.encoding.encode(text).length;
  }
  
  /**
   * Main entry point: Chunk a list of Notion blocks
   * 
   * @param blocks - Flat list of Notion blocks from a page
   * @param pageTitle - Page title for context
   * @returns Array of smart chunks with metadata
   */
  chunkNotionBlocks(blocks: NotionBlock[], pageTitle: string): NotionChunk[] {
    // Step 1: Parse into hierarchical sections
    const sections = this.parseIntoSections(blocks, pageTitle);
    
    // Step 2: Create chunks from each section
    const allChunks: NotionChunk[] = [];
    
    for (const section of sections) {
      const sectionChunks = this.chunkSection(section);
      allChunks.push(...sectionChunks);
    }
    
    // Step 3: Update totalChunks metadata
    return allChunks.map((chunk, idx) => ({
      ...chunk,
      chunkIndex: idx,
      totalChunks: allChunks.length,
    }));
  }
  
  /**
   * Parse flat block list into hierarchical sections
   * 
   * A section = all blocks between one heading and the next same-or-higher-level heading
   */
  private parseIntoSections(blocks: NotionBlock[], pageTitle: string): NotionSection[] {
    const sections: NotionSection[] = [];
    const headingStack: { level: number; title: string; path: string[] }[] = [
      { level: 0, title: pageTitle, path: [pageTitle] }
    ];
    
    let currentSection: NotionSection | null = null;
    
    for (const block of blocks) {
      const blockType = block.type;
      
      // Check if this is a heading
      const headingMatch = blockType.match(/^heading_(\d)$/);
      
      if (headingMatch) {
        // Save previous section
        if (currentSection && currentSection.blocks.length > 0) {
          sections.push(currentSection);
        }
        
        const level = parseInt(headingMatch[1]) as 1 | 2 | 3;
        const title = block.text.trim() || `Untitled ${blockType}`;
        
        // Pop stack until we find a parent heading
        while (headingStack.length > 1 && headingStack[headingStack.length - 1].level >= level) {
          headingStack.pop();
        }
        
        // Build section path
        const parentPath = headingStack[headingStack.length - 1].path;
        const sectionPath = [...parentPath, title];
        
        // Push current heading to stack
        headingStack.push({ level, title, path: sectionPath });
        
        // Start new section
        currentSection = {
          section_id: `${block.id}`,
          section_path: sectionPath,
          section_title: title,
          heading_level: level,
          blocks: [],
        };
      } else {
        // Non-heading block
        if (!currentSection) {
          // Create default section if we haven't seen a heading yet
          currentSection = {
            section_id: "intro",
            section_path: [pageTitle],
            section_title: pageTitle,
            heading_level: null,
            blocks: [],
          };
        }
        
        currentSection.blocks.push(block);
      }
    }
    
    // Don't forget the last section
    if (currentSection && currentSection.blocks.length > 0) {
      sections.push(currentSection);
    }
    
    return sections;
  }
  
  /**
   * Chunk a single section into one or more chunks
   * 
   * Strategy:
   * - Code blocks, tables, callouts → dedicated chunks (never split)
   * - Text blocks → group until token limit, respecting boundaries
   */
  private chunkSection(section: NotionSection): NotionChunk[] {
    const chunks: NotionChunk[] = [];
    const sectionPrefix = `[${section.section_path.join(" → ")}]\n\n`;
    
    let currentTextBlocks: NotionBlock[] = [];
    let currentTokens = this.countTokens(sectionPrefix);
    
    const flushTextChunk = () => {
      if (currentTextBlocks.length === 0) return;
      
      const text = sectionPrefix + currentTextBlocks.map(b => b.text).join("\n\n");
      const tokenCount = this.countTokens(text);
      
      chunks.push({
        text,
        tokenCount,
        section_path: section.section_path,
        section_title: section.section_title,
        section_id: section.section_id,
        heading_level: section.heading_level,
        chunk_type: "text",
        has_code: false,
        has_table: false,
        has_list: currentTextBlocks.some(b => 
          b.type.includes("list") || b.type === "to_do"
        ),
        block_ids: currentTextBlocks.map(b => b.id),
        chunkIndex: 0, // Will be set later
        totalChunks: 0, // Will be set later
      });
      
      currentTextBlocks = [];
      currentTokens = this.countTokens(sectionPrefix);
    };
    
    for (const block of section.blocks) {
      const blockType = block.type;
      const blockTokens = this.countTokens(block.text);
      
      // Special blocks get their own chunks
      if (blockType === "code") {
        // Flush any pending text
        flushTextChunk();
        
        // Create dedicated code chunk
        const codeLanguage = this.extractCodeLanguage(block);
        const text = sectionPrefix + `[Code: ${codeLanguage}]\n${block.text}`;
        
        chunks.push({
          text,
          tokenCount: this.countTokens(text),
          section_path: section.section_path,
          section_title: section.section_title,
          section_id: section.section_id,
          heading_level: section.heading_level,
          chunk_type: "code",
          has_code: true,
          has_table: false,
          has_list: false,
          code_language: codeLanguage,
          block_ids: [block.id],
          chunkIndex: 0,
          totalChunks: 0,
        });
      } else if (blockType === "table") {
        flushTextChunk();
        
        const text = sectionPrefix + `[Table]\n${block.text}`;
        chunks.push({
          text,
          tokenCount: this.countTokens(text),
          section_path: section.section_path,
          section_title: section.section_title,
          section_id: section.section_id,
          heading_level: section.heading_level,
          chunk_type: "table",
          has_code: false,
          has_table: true,
          has_list: false,
          block_ids: [block.id],
          chunkIndex: 0,
          totalChunks: 0,
        });
      } else if (blockType === "callout") {
        flushTextChunk();
        
        const text = sectionPrefix + `[Callout]\n${block.text}`;
        chunks.push({
          text,
          tokenCount: this.countTokens(text),
          section_path: section.section_path,
          section_title: section.section_title,
          section_id: section.section_id,
          heading_level: section.heading_level,
          chunk_type: "callout",
          has_code: false,
          has_table: false,
          has_list: false,
          block_ids: [block.id],
          chunkIndex: 0,
          totalChunks: 0,
        });
      } else if (blockType === "quote") {
        flushTextChunk();
        
        const text = sectionPrefix + `[Quote]\n${block.text}`;
        chunks.push({
          text,
          tokenCount: this.countTokens(text),
          section_path: section.section_path,
          section_title: section.section_title,
          section_id: section.section_id,
          heading_level: section.heading_level,
          chunk_type: "quote",
          has_code: false,
          has_table: false,
          has_list: false,
          block_ids: [block.id],
          chunkIndex: 0,
          totalChunks: 0,
        });
      } else {
        // Regular text block
        // Check if adding this block would exceed limit
        if (currentTokens + blockTokens > CHUNK_CONFIG.MAX_TOKENS && currentTextBlocks.length > 0) {
          flushTextChunk();
        }
        
        currentTextBlocks.push(block);
        currentTokens += blockTokens + 2; // +2 for "\n\n"
      }
    }
    
    // Flush remaining text blocks
    flushTextChunk();
    
    return chunks;
  }
  
  /**
   * Extract code language from Notion code block
   * Notion stores language in block metadata, but we might need to infer it
   */
  private extractCodeLanguage(block: NotionBlock): string {
    // TODO: When we integrate with real Notion API, check block.code?.language
    // For now, infer from content
    const text = block.text.toLowerCase();
    
    if (text.includes("create table") || text.includes("insert into") || text.includes("select ")) {
      return "sql";
    }
    if (text.includes("graph ") || text.includes("subgraph ")) {
      return "mermaid";
    }
    if (text.includes("function ") || text.includes("const ") || text.includes("=>")) {
      return "typescript";
    }
    if (text.includes("def ") || text.includes("import ")) {
      return "python";
    }
    if (text.includes("curl ") || text.includes("npm ") || text.includes("git ")) {
      return "bash";
    }
    if (text.startsWith("{") || text.startsWith("[")) {
      return "json";
    }
    
    return "plain text";
  }
}

export const notionChunkingService = new NotionChunkingService();
