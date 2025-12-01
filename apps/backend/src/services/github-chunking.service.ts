/**
 * GitHubChunkingService - Structure-aware intelligent chunking for code repositories
 *
 * Philosophy:
 * - The unit of meaning in code is: Repo → File → Functions/Classes → Lines
 * - Not "1000 tokens" — but code structure (functions, classes, exports)
 *
 * Chunking Strategy:
 * 1. Parse files with Babel (primary) + TypeScript API (fallback)
 * 2. Generate file_overview chunks (deterministic: path, exports, role, language)
 * 3. Generate symbol-level chunks (functions, classes, configs, types)
 * 4. Target 300-600 tokens per chunk, max 800 tokens
 * 5. Add rich metadata for filtering and boosting
 *
 * Supported Languages (Phase 1):
 * - TypeScript (.ts, .tsx)
 * - JavaScript (.js, .jsx, .mjs, .cjs)
 * - Future: Python, Go, Rust, etc. (via Tree-sitter when Node 20+)
 */

import * as babelParser from "@babel/parser";
import * as ts from "typescript";
import { encoding_for_model } from "tiktoken";

/**
 * Language registry: file extension → language
 */
const LANGUAGE_REGISTRY: Record<string, string> = {
  // JavaScript/TypeScript
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "jsx",
  ".mjs": "javascript",
  ".cjs": "javascript",

  // Config files (important for understanding project structure)
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".md": "markdown",

  // Future languages (commented out for now - need Tree-sitter)
  // '.py': 'python',
  // '.go': 'go',
  // '.rs': 'rust',
  // '.java': 'java',
  // '.kt': 'kotlin',
  // '.cs': 'csharp',
  // '.rb': 'ruby',
  // '.php': 'php',
};

/**
 * File role patterns (auto-detect from path)
 */
const FILE_ROLE_PATTERNS: Record<string, RegExp> = {
  service: /\/(services|service)\//,
  controller: /\/(controllers|controller|routes|route)\//,
  component: /\/(components|component)\//,
  schema: /\/(schema|schemas|models|model)\//,
  config: /\/(config|configs|configuration)\//,
  test: /\.(test|spec)\.(ts|tsx|js|jsx)$/,
  types: /\/(types|type|interfaces|interface)\/|\.d\.ts$/,
  migration: /\/(migrations|migrate)\//,
  util: /\/(utils|util|helpers|helper|lib)\//,
};

/**
 * Skip patterns (never index these)
 */
const SKIP_PATTERNS = [
  // Dependencies
  /node_modules\//,
  /vendor\//,

  // Build artifacts
  /dist\//,
  /build\//,
  /\.next\//,
  /out\//,
  /coverage\//,

  // Minified files
  /\.min\.(js|css)$/,

  // Lock files
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,

  // Source maps
  /\.map$/,

  // Environment files (except .env.example)
  /\.env$/,
  /\.env\.local$/,
  /\.env\.development$/,
  /\.env\.production$/,
  /\.env\.staging$/,
  /\.env\.test$/,
  // BUT allow .env.example explicitly (see shouldSkipFile logic)

  // Local config files
  /\.local$/,

  // Generated files
  /\.generated\.(ts|js)$/,
  /\.gen\.(ts|js)$/,
  /-generated\.(ts|js)$/,

  // Database dumps
  /\.sql\.gz$/,
  /\.db$/,
  /\.sqlite$/,

  // Binary/media files
  /\.(png|jpg|jpeg|gif|ico|svg|webp|woff|woff2|ttf|eot)$/,
  /\.(mp4|webm|ogg|mp3|wav|flac|aac)$/,
  /\.(zip|tar|gz|rar|7z)$/,
  /\.pdf$/,

  // OS files
  /\.DS_Store$/,
  /Thumbs\.db$/,

  // IDE files
  /\.vscode\//,
  /\.idea\//,
  /\.vs\//,
];

/**
 * Area classification patterns (from path)
 */
const AREA_PATTERNS: Record<string, RegExp> = {
  "electron-main": /apps\/electron\/src\/main/,
  "electron-renderer": /apps\/electron\/src\/renderer/,
  "backend-api": /apps\/backend\/src\/(routes|controllers)/,
  "backend-services": /apps\/backend\/src\/services/,
  "backend-db": /apps\/backend\/src\/db/,
  "frontend-ui": /apps\/frontend\/src\/(components|pages)/,
  "shared-types": /packages\/shared/,
};

/**
 * Parsed file metadata (from file system)
 */
export interface GitHubFile {
  repoId: string;
  repoFullName: string; // "Febchuk/mitable"
  path: string; // "apps/backend/src/services/notion.service.ts"
  fileName: string; // "notion.service.ts"
  content: string; // Raw file content
  commitSha: string;
  author: string;
  committedAt: string;
  defaultBranch: string;
}

/**
 * Parsed symbol (function, class, etc.)
 */
export interface CodeSymbol {
  type: "function" | "class" | "method" | "const" | "type" | "interface" | "enum";
  name: string;
  startLine: number;
  endLine: number;
  code: string; // The actual code text
  isExported: boolean;
  isAsync?: boolean;
  visibility?: "public" | "private" | "protected";
  parentClass?: string; // For methods
}

/**
 * Chunk with structure-aware metadata
 */
export interface GitHubCodeChunk {
  // ===== CONTENT =====
  text: string; // METADATA ONLY: File path, function name, lines (NO raw code stored)
  _embeddingText?: string; // INTERNAL ONLY: Full code for embedding generation (discarded after embedding)

  // ===== REPO CONTEXT =====
  repo_id: string;
  repo_full_name: string;
  org_id: string;

  // ===== FILE CONTEXT =====
  path: string;
  file_name: string;
  language: string;
  file_role: string; // 'service' | 'controller' | 'component' | etc.
  area?: string; // 'backend-services' | 'electron-main' | etc.

  // ===== GIT CONTEXT =====
  commit_sha: string;
  author: string;
  committed_at: string;
  default_branch: string;

  // ===== CHUNK METADATA =====
  chunk_type:
    | "file_overview"
    | "function"
    | "class"
    | "method"
    | "config"
    | "type"
    | "migration"
    | "file_segment"
    | "commit_summary"
    | "pr_summary"
    | "pr_comments"
    | "issue_summary"
    | "issue_comments";
  start_line: number;
  end_line: number;
  token_count: number;

  // ===== SYMBOL METADATA =====
  function_name?: string;
  class_name?: string;
  exports?: string[]; // For file_overview
  is_exported?: boolean;
  is_test_file?: boolean;
  is_generated?: boolean;

  // ===== CHUNKING METADATA =====
  chunk_index: number;
  total_chunks: number;
  segment_index?: number; // If a symbol was split into segments
  segment_count?: number;
}

/**
 * Configuration for chunking
 */
const CHUNK_CONFIG = {
  TARGET_TOKENS: 500, // Target chunk size
  MAX_TOKENS: 800, // Hard maximum
  MIN_TOKENS: 50, // Don't create tiny chunks
} as const;

/**
 * GitHubChunkingService - Structure-aware code chunking
 */
class GitHubChunkingService {
  private tokenizer = encoding_for_model("gpt-3.5-turbo");

  /**
   * Main entry point: chunk GitHub code files intelligently
   * Alias: chunkFile() for consistency with ingestion service
   *
   * @param file - File metadata from GitHub API
   * @param orgId - Organization ID
   * @returns Array of smart code chunks
   */
  chunkFile(file: GitHubFile, orgId: string): GitHubCodeChunk[] {
    return this.chunkGitHubFile(file, orgId);
  }

  /**
   * Internal implementation: chunk GitHub code files intelligently
   *
   * @param file - File metadata from GitHub API
   * @param orgId - Organization ID
   * @returns Array of smart code chunks
   */
  private chunkGitHubFile(file: GitHubFile, orgId: string): GitHubCodeChunk[] {
    // Check if we should skip this file
    if (this.shouldSkipFile(file.path)) {
      // Don't log every skip - too noisy
      return [];
    }

    // Detect language
    const language = this.detectLanguage(file.fileName);
    if (!language) {
      // Language not supported - silently skip
      return [];
    }

    // Detect file role and area
    const fileRole = this.detectFileRole(file.path);
    const area = this.detectArea(file.path);
    const isTestFile = FILE_ROLE_PATTERNS.test.test(file.path);
    const isGenerated = this.isGeneratedFile(file.path, file.content);

    const chunks: GitHubCodeChunk[] = [];

    // Parse the file based on language
    if (
      language === "typescript" ||
      language === "javascript" ||
      language === "tsx" ||
      language === "jsx"
    ) {
      const symbols = this.parseTypeScriptJavaScript(file);

      if (symbols) {
        // Generate file_overview chunk
        const overviewChunk = this.createFileOverviewChunk(
          file,
          symbols,
          orgId,
          language,
          fileRole,
          area,
          isTestFile,
          isGenerated
        );
        chunks.push(overviewChunk);

        // Generate symbol-level chunks
        for (const symbol of symbols) {
          const symbolChunks = this.createSymbolChunks(
            file,
            symbol,
            orgId,
            language,
            fileRole,
            area,
            isTestFile,
            isGenerated
          );
          chunks.push(...symbolChunks);
        }
      }
    } else if (
      language === "json" ||
      language === "yaml" ||
      language === "toml" ||
      language === "markdown"
    ) {
      // Config files and docs - split into chunks respecting 500-800 token limit
      const header = `[${file.repoFullName} / ${file.path}]\n`;
      const roleText = `File type: ${language}\n`;
      const areaText = area ? `Area: ${area}\n\n` : "\n";

      const headerPrefix = header + roleText + areaText;
      const headerTokens = this.countTokens(headerPrefix);
      const TARGET_TOKENS = 600; // Target chunk size (actual max is 800)
      const availableTokens = TARGET_TOKENS - headerTokens;

      // Split by markdown headers for markdown files, or by lines for others
      let sections: Array<{ text: string; startLine: number; endLine: number }> = [];

      if (language === "markdown") {
        // Split by ## headers (preserve structure)
        const lines = file.content.split("\n");
        let currentSection = "";
        let sectionStartLine = 1;
        let currentLine = 1;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // Start new section on ## headers (not # for main title)
          if (line.match(/^##\s+/) && currentSection.length > 0) {
            sections.push({
              text: currentSection.trim(),
              startLine: sectionStartLine,
              endLine: currentLine - 1,
            });
            currentSection = line + "\n";
            sectionStartLine = currentLine;
          } else {
            currentSection += line + "\n";
          }
          currentLine++;
        }

        // Add final section
        if (currentSection.trim().length > 0) {
          sections.push({
            text: currentSection.trim(),
            startLine: sectionStartLine,
            endLine: lines.length,
          });
        }
      } else {
        // For JSON/YAML/TOML, treat as one section (will be split by token count if needed)
        sections = [
          {
            text: file.content,
            startLine: 1,
            endLine: file.content.split("\n").length,
          },
        ];
      }

      // Further split sections that exceed token limit
      const finalChunks: typeof sections = [];
      for (const section of sections) {
        const sectionTokens = this.countTokens(section.text);

        if (sectionTokens <= availableTokens) {
          // Section fits, keep as-is
          finalChunks.push(section);
        } else {
          // Section too large, split by lines
          const lines = section.text.split("\n");
          let chunkText = "";
          let chunkTokens = 0;
          let chunkStartLine = section.startLine;
          let currentLineInSection = section.startLine;

          for (const line of lines) {
            const lineTokens = this.countTokens(line + "\n");

            if (chunkTokens + lineTokens > availableTokens && chunkText.length > 0) {
              // Save current chunk
              finalChunks.push({
                text: chunkText.trim(),
                startLine: chunkStartLine,
                endLine: currentLineInSection - 1,
              });
              chunkText = line + "\n";
              chunkTokens = lineTokens;
              chunkStartLine = currentLineInSection;
            } else {
              chunkText += line + "\n";
              chunkTokens += lineTokens;
            }
            currentLineInSection++;
          }

          // Add final chunk from this section
          if (chunkText.trim().length > 0) {
            finalChunks.push({
              text: chunkText.trim(),
              startLine: chunkStartLine,
              endLine: currentLineInSection - 1,
            });
          }
        }
      }

      // Create chunks with linking metadata
      finalChunks.forEach((section, idx) => {
        const text = headerPrefix + section.text;
        chunks.push({
          text,
          repo_id: file.repoId,
          repo_full_name: file.repoFullName,
          org_id: orgId,
          path: file.path,
          file_name: file.fileName,
          language,
          file_role: fileRole,
          area,
          commit_sha: file.commitSha,
          author: file.author,
          committed_at: file.committedAt,
          default_branch: file.defaultBranch,
          chunk_type: "config",
          start_line: section.startLine,
          end_line: section.endLine,
          token_count: this.countTokens(text),
          is_test_file: false,
          is_generated: isGenerated,
          chunk_index: idx,
          total_chunks: finalChunks.length, // Will be updated below
        });
      });
    } else {
      // For other languages (future: Tree-sitter support)
      console.log(`[GitHubChunking] Language ${language} not yet supported for ${file.path}`);
      return [];
    }

    // Set chunk indices
    chunks.forEach((chunk, idx) => {
      chunk.chunk_index = idx;
      chunk.total_chunks = chunks.length;
    });

    // Don't log here - ingestion service will log
    return chunks;
  }

  /**
   * Check if file should be skipped
   */
  private shouldSkipFile(path: string): boolean {
    // Allow .env.example explicitly (it's documentation, not secrets)
    if (path.endsWith(".env.example") || path.endsWith(".env.sample")) {
      return false;
    }

    return SKIP_PATTERNS.some((pattern) => pattern.test(path));
  }

  /**
   * Detect if file is generated (auto-generated code)
   */
  private isGeneratedFile(path: string, content: string): boolean {
    // Check filename patterns
    if (/\.(generated|gen)\.(ts|js|tsx|jsx)$/.test(path)) return true;
    if (/-generated\.(ts|js|tsx|jsx)$/.test(path)) return true;

    // Check for common generated file markers in content (first 500 chars)
    const header = content.substring(0, 500).toLowerCase();

    const generatedMarkers = [
      "@generated",
      "auto-generated",
      "autogenerated",
      "do not edit",
      "do not modify",
      "this file is generated",
      "generated by",
      "code generated",
      "prisma client",
      "graphql codegen",
    ];

    return generatedMarkers.some((marker) => header.includes(marker));
  }

  /**
   * Detect language from file extension
   */
  private detectLanguage(fileName: string): string | null {
    const ext = fileName.match(/\.[^.]+$/)?.[0];
    return ext ? LANGUAGE_REGISTRY[ext] || null : null;
  }

  /**
   * Detect file role from path
   */
  private detectFileRole(path: string): string {
    for (const [role, pattern] of Object.entries(FILE_ROLE_PATTERNS)) {
      if (pattern.test(path)) return role;
    }
    return "other";
  }

  /**
   * Detect area from path
   */
  private detectArea(path: string): string | undefined {
    for (const [area, pattern] of Object.entries(AREA_PATTERNS)) {
      if (pattern.test(path)) return area;
    }
    return undefined;
  }

  /**
   * Parse TypeScript/JavaScript file using Babel (primary) + TS API (fallback)
   */
  private parseTypeScriptJavaScript(file: GitHubFile): CodeSymbol[] | null {
    // Try Babel first (simpler, has loc built-in)
    const babelResult = this.tryBabel(file);
    if (babelResult) return babelResult;

    // Fallback to TypeScript API
    const tsResult = this.tryTypeScriptAPI(file);
    if (tsResult) return tsResult;

    // Both failed
    console.error(
      `[GitHubChunking] Failed to parse ${file.path} with both Babel and TypeScript API`
    );
    return null;
  }

  /**
   * Try parsing with Babel
   */
  private tryBabel(file: GitHubFile): CodeSymbol[] | null {
    try {
      const ast = babelParser.parse(file.content, {
        sourceType: "module",
        plugins: ["typescript", "jsx", "decorators-legacy"],
        errorRecovery: true,
      });

      const symbols: CodeSymbol[] = [];
      const lines = file.content.split("\n");

      // Walk top-level declarations
      for (const node of ast.program.body) {
        if (node.type === "FunctionDeclaration" && node.id && node.loc) {
          symbols.push({
            type: "function",
            name: node.id.name,
            startLine: node.loc.start.line,
            endLine: node.loc.end.line,
            code: lines.slice(node.loc.start.line - 1, node.loc.end.line).join("\n"),
            isExported: this.isExportedBabel(ast.program.body, node),
            isAsync: node.async,
          });
        } else if (node.type === "ClassDeclaration" && node.id && node.loc) {
          symbols.push({
            type: "class",
            name: node.id.name,
            startLine: node.loc.start.line,
            endLine: node.loc.end.line,
            code: lines.slice(node.loc.start.line - 1, node.loc.end.line).join("\n"),
            isExported: this.isExportedBabel(ast.program.body, node),
          });
        } else if (
          node.type === "VariableDeclaration" &&
          node.loc &&
          node.declarations.length > 0
        ) {
          const decl = node.declarations[0];
          if (decl.id.type === "Identifier") {
            symbols.push({
              type: "const",
              name: decl.id.name,
              startLine: node.loc.start.line,
              endLine: node.loc.end.line,
              code: lines.slice(node.loc.start.line - 1, node.loc.end.line).join("\n"),
              isExported: this.isExportedBabel(ast.program.body, node),
            });
          }
        } else if (
          (node.type === "TSInterfaceDeclaration" || node.type === "TSTypeAliasDeclaration") &&
          node.loc
        ) {
          const name = node.id ? node.id.name : "unknown";
          symbols.push({
            type: node.type === "TSInterfaceDeclaration" ? "interface" : "type",
            name,
            startLine: node.loc.start.line,
            endLine: node.loc.end.line,
            code: lines.slice(node.loc.start.line - 1, node.loc.end.line).join("\n"),
            isExported: this.isExportedBabel(ast.program.body, node),
          });
        }
      }

      return symbols;
    } catch (error) {
      console.log(
        `[GitHubChunking] Babel failed for ${file.path}, will try TypeScript API fallback...`
      );
      return null;
    }
  }

  /**
   * Check if node is exported (Babel AST)
   */
  private isExportedBabel(body: any[], node: any): boolean {
    // Check if this node is wrapped in an export declaration
    for (const stmt of body) {
      if (
        (stmt.type === "ExportNamedDeclaration" || stmt.type === "ExportDefaultDeclaration") &&
        stmt.declaration === node
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Try parsing with TypeScript Compiler API (fallback)
   */
  private tryTypeScriptAPI(file: GitHubFile): CodeSymbol[] | null {
    try {
      const sourceFile = ts.createSourceFile(
        file.fileName,
        file.content,
        ts.ScriptTarget.Latest,
        true // setParentNodes
      );

      const symbols: CodeSymbol[] = [];
      const lines = file.content.split("\n");

      const visit = (node: ts.Node) => {
        if (ts.isFunctionDeclaration(node) && node.name) {
          const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
          symbols.push({
            type: "function",
            name: node.name.text,
            startLine: start.line + 1, // TS is 0-indexed
            endLine: end.line + 1,
            code: lines.slice(start.line, end.line + 1).join("\n"),
            isExported: this.hasExportModifier(node),
            isAsync: this.hasAsyncModifier(node),
          });
        } else if (ts.isClassDeclaration(node) && node.name) {
          const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
          symbols.push({
            type: "class",
            name: node.name.text,
            startLine: start.line + 1,
            endLine: end.line + 1,
            code: lines.slice(start.line, end.line + 1).join("\n"),
            isExported: this.hasExportModifier(node),
          });
        } else if (ts.isVariableStatement(node)) {
          const decl = node.declarationList.declarations[0];
          if (decl && ts.isIdentifier(decl.name)) {
            const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
            symbols.push({
              type: "const",
              name: decl.name.text,
              startLine: start.line + 1,
              endLine: end.line + 1,
              code: lines.slice(start.line, end.line + 1).join("\n"),
              isExported: this.hasExportModifier(node),
            });
          }
        } else if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
          const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
          symbols.push({
            type: ts.isInterfaceDeclaration(node) ? "interface" : "type",
            name: node.name.text,
            startLine: start.line + 1,
            endLine: end.line + 1,
            code: lines.slice(start.line, end.line + 1).join("\n"),
            isExported: this.hasExportModifier(node),
          });
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
      return symbols;
    } catch (error) {
      console.error(`[GitHubChunking] TypeScript API failed for ${file.path}:`, error);
      return null;
    }
  }

  /**
   * Check if node has export modifier (TypeScript API)
   */
  private hasExportModifier(node: ts.Node): boolean {
    if (!ts.canHaveModifiers(node)) return false;
    const modifiers = ts.getModifiers(node);
    return !!(modifiers && modifiers.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword));
  }

  /**
   * Check if node has async modifier
   */
  private hasAsyncModifier(node: ts.Node): boolean {
    if (!ts.canHaveModifiers(node)) return false;
    const modifiers = ts.getModifiers(node);
    return !!(modifiers && modifiers.some((mod) => mod.kind === ts.SyntaxKind.AsyncKeyword));
  }

  /**
   * Create file_overview chunk (deterministic, no LLM needed)
   */
  private createFileOverviewChunk(
    file: GitHubFile,
    symbols: CodeSymbol[],
    orgId: string,
    language: string,
    fileRole: string,
    area: string | undefined,
    isTestFile: boolean,
    isGenerated: boolean
  ): GitHubCodeChunk {
    // Extract exports
    const exports = symbols.filter((s) => s.isExported).map((s) => s.name);

    // Build overview text
    const header = `[${file.repoFullName} / ${file.path}]\n`;
    const roleText = `File role: ${fileRole}\n`;
    const langText = `Language: ${language}\n`;
    const areaText = area ? `Area: ${area}\n` : "";
    const exportsText =
      exports.length > 0
        ? `\nExports:\n${exports.map((e) => `- ${e}`).join("\n")}\n`
        : "\nNo exports.\n";

    const text = header + roleText + langText + areaText + exportsText;

    return {
      text,
      repo_id: file.repoId,
      repo_full_name: file.repoFullName,
      org_id: orgId,
      path: file.path,
      file_name: file.fileName,
      language,
      file_role: fileRole,
      area,
      commit_sha: file.commitSha,
      author: file.author,
      committed_at: file.committedAt,
      default_branch: file.defaultBranch,
      chunk_type: "file_overview",
      start_line: 1,
      end_line: file.content.split("\n").length,
      token_count: this.countTokens(text),
      exports,
      is_test_file: isTestFile,
      is_generated: isGenerated,
      chunk_index: 0,
      total_chunks: 0,
    };
  }

  /**
   * Create symbol-level chunks (functions, classes, etc.)
   * Splits large symbols into segments if needed
   */
  private createSymbolChunks(
    file: GitHubFile,
    symbol: CodeSymbol,
    orgId: string,
    language: string,
    fileRole: string,
    area: string | undefined,
    isTestFile: boolean,
    isGenerated: boolean
  ): GitHubCodeChunk[] {
    const tokenCount = this.countTokens(symbol.code);

    // If symbol fits in one chunk, create single chunk
    if (tokenCount <= CHUNK_CONFIG.MAX_TOKENS) {
      const header = `[${file.repoFullName} / ${file.path} • ${symbol.type} ${symbol.name}]\nLines ${symbol.startLine}-${symbol.endLine}\n\n`;
      const fullText = header + symbol.code; // Full code: used for embedding generation, then discarded
      const storedText = header; // Metadata header: stored in DB/Pinecone for search (NO code)

      return [
        {
          text: storedText, // ← Searchable metadata (file path + line numbers)
          _embeddingText: fullText, // ← Full code for embedding (discarded after use)
          repo_id: file.repoId,
          repo_full_name: file.repoFullName,
          org_id: orgId,
          path: file.path,
          file_name: file.fileName,
          language,
          file_role: fileRole,
          area,
          commit_sha: file.commitSha,
          author: file.author,
          committed_at: file.committedAt,
          default_branch: file.defaultBranch,
          chunk_type: symbol.type === "method" ? "method" : (symbol.type as any),
          start_line: symbol.startLine,
          end_line: symbol.endLine,
          token_count: this.countTokens(fullText),
          function_name: symbol.type === "function" ? symbol.name : undefined,
          class_name: symbol.type === "class" ? symbol.name : symbol.parentClass,
          is_exported: symbol.isExported,
          is_test_file: isTestFile,
          is_generated: isGenerated,
          chunk_index: 0,
          total_chunks: 0,
        },
      ];
    }

    // Symbol is too large - split into segments
    return this.splitSymbolIntoSegments(
      file,
      symbol,
      orgId,
      language,
      fileRole,
      area,
      isTestFile,
      isGenerated
    );
  }

  /**
   * Split large symbol into segments
   */
  private splitSymbolIntoSegments(
    file: GitHubFile,
    symbol: CodeSymbol,
    orgId: string,
    language: string,
    fileRole: string,
    area: string | undefined,
    isTestFile: boolean,
    isGenerated: boolean
  ): GitHubCodeChunk[] {
    const lines = symbol.code.split("\n");
    const chunks: GitHubCodeChunk[] = [];

    // Rough estimate: target ~50 lines per segment
    const targetLinesPerSegment = 50;
    let currentSegment: string[] = [];
    let segmentStartLine = symbol.startLine;
    let segmentIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      currentSegment.push(lines[i]);

      // Check if we should create a segment
      if (currentSegment.length >= targetLinesPerSegment || i === lines.length - 1) {
        const segmentCode = currentSegment.join("\n");
        const segmentEndLine = segmentStartLine + currentSegment.length - 1;
        const totalSegments = Math.ceil(lines.length / targetLinesPerSegment);

        const header = `[${file.repoFullName} / ${file.path} • ${symbol.type} ${symbol.name} (segment ${segmentIndex + 1}/${totalSegments})]\nLines ${segmentStartLine}-${segmentEndLine}\n\n`;
        const fullText = header + segmentCode; // Full code: used for embedding generation, then discarded
        const storedText = header; // Metadata header: stored in DB/Pinecone for search (NO code)

        chunks.push({
          text: storedText, // ← Searchable metadata (file path + line numbers)
          _embeddingText: fullText, // ← Full code for embedding (discarded after use)
          repo_id: file.repoId,
          repo_full_name: file.repoFullName,
          org_id: orgId,
          path: file.path,
          file_name: file.fileName,
          language,
          file_role: fileRole,
          area,
          commit_sha: file.commitSha,
          author: file.author,
          committed_at: file.committedAt,
          default_branch: file.defaultBranch,
          chunk_type: symbol.type === "method" ? "method" : (symbol.type as any),
          start_line: segmentStartLine,
          end_line: segmentEndLine,
          token_count: this.countTokens(fullText),
          function_name: symbol.type === "function" ? symbol.name : undefined,
          class_name: symbol.type === "class" ? symbol.name : symbol.parentClass,
          is_exported: symbol.isExported,
          is_test_file: isTestFile,
          is_generated: isGenerated,
          segment_index: segmentIndex,
          segment_count: totalSegments,
          chunk_index: 0,
          total_chunks: 0,
        });

        // Reset for next segment
        currentSegment = [];
        segmentStartLine = segmentEndLine + 1;
        segmentIndex++;
      }
    }

    return chunks;
  }

  /**
   * Count tokens using tiktoken
   */
  private countTokens(text: string): number {
    try {
      return this.tokenizer.encode(text).length;
    } catch (error) {
      // Fallback: rough estimate (1 token ≈ 4 chars)
      return Math.ceil(text.length / 4);
    }
  }

  /**
   * ============================================================================
   * PHASE 2: WORK DOMAIN CHUNKING (Commits, PRs, Issues)
   * ============================================================================
   */

  /**
   * Chunk a commit into a commit_summary chunk
   */
  chunkCommit(
    commit: {
      sha: string;
      message: string;
      authorName: string;
      authorEmail: string;
      committedAt: string;
      filesChanged: { path: string; status: string }[];
    },
    repo: { id: string; fullName: string; defaultBranch: string },
    orgId: string
  ): GitHubCodeChunk {
    // Detect areas from file paths
    const areas = new Set<string>();
    for (const file of commit.filesChanged) {
      const area = this.detectArea(file.path);
      if (area) areas.add(area);
    }

    // Build deterministic commit text
    const header = `[${repo.fullName} / Commit ${commit.sha.slice(0, 7)}]\n\n`;
    const messageText = `Message: ${commit.message}\n\n`;
    const authorText = `Author: ${commit.authorName}\n`;
    const dateText = `Date: ${new Date(commit.committedAt).toISOString()}\n`;
    const branchText = `Branch: ${repo.defaultBranch}\n\n`;

    const filesText =
      commit.filesChanged.length > 0
        ? `Files changed (${commit.filesChanged.length}):\n${commit.filesChanged
            .slice(0, 20) // Limit to first 20 files
            .map((f) => `- ${f.path} (${f.status})`)
            .join("\n")}\n`
        : "No files changed.\n";

    const areasText = areas.size > 0 ? `\nAreas: ${Array.from(areas).join(", ")}\n` : "";

    const text = header + messageText + authorText + dateText + branchText + filesText + areasText;

    return {
      text,
      repo_id: repo.id,
      repo_full_name: repo.fullName,
      org_id: orgId,
      path: "", // Not applicable for commits
      file_name: "",
      language: "",
      file_role: "",
      area: areas.size > 0 ? Array.from(areas)[0] : undefined, // First area
      commit_sha: commit.sha,
      author: commit.authorName,
      committed_at: commit.committedAt,
      default_branch: repo.defaultBranch,
      chunk_type: "commit_summary",
      start_line: 0,
      end_line: 0,
      token_count: this.countTokens(text),
      chunk_index: 0,
      total_chunks: 1,
    };
  }

  /**
   * Chunk a PR into pr_summary + pr_comments (if any)
   */
  chunkPullRequest(
    pr: {
      number: number;
      title: string;
      body: string | null;
      authorLogin: string;
      state: string;
      isMerged: boolean;
      mergedAt: string | null;
      createdAt: string;
      labels: string[];
      filesChanged: { path: string }[];
      comments: { id: string; body: string; authorLogin: string; createdAt: string }[];
    },
    repo: { id: string; fullName: string; defaultBranch: string },
    orgId: string
  ): GitHubCodeChunk[] {
    const chunks: GitHubCodeChunk[] = [];

    // Detect areas from touched files
    const areas = new Set<string>();
    for (const file of pr.filesChanged) {
      const area = this.detectArea(file.path);
      if (area) areas.add(area);
    }

    // 1. PR Summary chunk
    const summaryHeader = `[${repo.fullName} / PR #${pr.number}]\n\n`;
    const titleText = `Title: ${pr.title}\n\n`;
    const bodyText = pr.body ? `Description:\n${pr.body}\n\n` : "";
    const authorText = `Author: ${pr.authorLogin}\n`;
    const stateText = `State: ${pr.state}${pr.isMerged ? " (merged)" : ""}\n`;
    const dateText = `Created: ${new Date(pr.createdAt).toISOString()}\n`;
    const labelsText = pr.labels.length > 0 ? `Labels: ${pr.labels.join(", ")}\n` : "";
    const filesText =
      pr.filesChanged.length > 0
        ? `\nFiles touched (${pr.filesChanged.length}):\n${pr.filesChanged
            .slice(0, 15)
            .map((f) => `- ${f.path}`)
            .join("\n")}\n`
        : "";
    const areasText = areas.size > 0 ? `\nAreas: ${Array.from(areas).join(", ")}\n` : "";

    const summaryText =
      summaryHeader +
      titleText +
      bodyText +
      authorText +
      stateText +
      dateText +
      labelsText +
      filesText +
      areasText;

    chunks.push({
      text: summaryText,
      repo_id: repo.id,
      repo_full_name: repo.fullName,
      org_id: orgId,
      path: "",
      file_name: "",
      language: "",
      file_role: "",
      area: areas.size > 0 ? Array.from(areas)[0] : undefined,
      commit_sha: "",
      author: pr.authorLogin,
      committed_at: pr.createdAt,
      default_branch: repo.defaultBranch,
      chunk_type: "pr_summary",
      start_line: 0,
      end_line: 0,
      token_count: this.countTokens(summaryText),
      chunk_index: 0,
      total_chunks: 0, // Will update later
    });

    // 2. PR Comments (thread-aware windows like Slack)
    if (pr.comments.length > 0) {
      const commentChunks = this.chunkComments(
        pr.comments,
        "pr_comments",
        repo,
        orgId,
        pr.authorLogin,
        pr.createdAt,
        areas.size > 0 ? Array.from(areas)[0] : undefined
      );
      chunks.push(...commentChunks);
    }

    // Update chunk indices
    chunks.forEach((chunk, idx) => {
      chunk.chunk_index = idx;
      chunk.total_chunks = chunks.length;
    });

    return chunks;
  }

  /**
   * Chunk an issue into issue_summary + issue_comments (if any)
   */
  chunkIssue(
    issue: {
      number: number;
      title: string;
      body: string | null;
      authorLogin: string;
      state: string;
      createdAt: string;
      labels: string[];
      comments: { id: string; body: string; authorLogin: string; createdAt: string }[];
    },
    repo: { id: string; fullName: string; defaultBranch: string },
    orgId: string
  ): GitHubCodeChunk[] {
    const chunks: GitHubCodeChunk[] = [];

    // 1. Issue Summary chunk
    const summaryHeader = `[${repo.fullName} / Issue #${issue.number}]\n\n`;
    const titleText = `Title: ${issue.title}\n\n`;
    const bodyText = issue.body ? `Description:\n${issue.body}\n\n` : "";
    const authorText = `Author: ${issue.authorLogin}\n`;
    const stateText = `State: ${issue.state}\n`;
    const dateText = `Created: ${new Date(issue.createdAt).toISOString()}\n`;
    const labelsText = issue.labels.length > 0 ? `Labels: ${issue.labels.join(", ")}\n` : "";

    const summaryText =
      summaryHeader + titleText + bodyText + authorText + stateText + dateText + labelsText;

    chunks.push({
      text: summaryText,
      repo_id: repo.id,
      repo_full_name: repo.fullName,
      org_id: orgId,
      path: "",
      file_name: "",
      language: "",
      file_role: "",
      area: undefined,
      commit_sha: "",
      author: issue.authorLogin,
      committed_at: issue.createdAt,
      default_branch: repo.defaultBranch,
      chunk_type: "issue_summary",
      start_line: 0,
      end_line: 0,
      token_count: this.countTokens(summaryText),
      chunk_index: 0,
      total_chunks: 0, // Will update later
    });

    // 2. Issue Comments (thread-aware windows like Slack)
    if (issue.comments.length > 0) {
      const commentChunks = this.chunkComments(
        issue.comments,
        "issue_comments",
        repo,
        orgId,
        issue.authorLogin,
        issue.createdAt,
        undefined
      );
      chunks.push(...commentChunks);
    }

    // Update chunk indices
    chunks.forEach((chunk, idx) => {
      chunk.chunk_index = idx;
      chunk.total_chunks = chunks.length;
    });

    return chunks;
  }

  /**
   * Chunk comments into windows (like Slack message windows)
   * Groups 3-5 comments per chunk, ordered chronologically
   */
  private chunkComments(
    comments: { id: string; body: string; authorLogin: string; createdAt: string }[],
    chunkType: "pr_comments" | "issue_comments",
    repo: { id: string; fullName: string; defaultBranch: string },
    orgId: string,
    mainAuthor: string,
    mainCreatedAt: string,
    area: string | undefined
  ): GitHubCodeChunk[] {
    const chunks: GitHubCodeChunk[] = [];
    const COMMENTS_PER_WINDOW = 4; // Similar to Slack (3-5 messages per window)

    // Sort comments chronologically
    const sortedComments = [...comments].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // Create comment windows
    for (let i = 0; i < sortedComments.length; i += COMMENTS_PER_WINDOW) {
      const windowComments = sortedComments.slice(i, i + COMMENTS_PER_WINDOW);

      const windowText = windowComments
        .map((c) => `[${c.authorLogin}] ${new Date(c.createdAt).toISOString()}\n${c.body}\n`)
        .join("\n---\n\n");

      const header = `[${repo.fullName} / ${chunkType === "pr_comments" ? "PR" : "Issue"} Comments (${i / COMMENTS_PER_WINDOW + 1})]\n\n`;
      const text = header + windowText;

      chunks.push({
        text,
        repo_id: repo.id,
        repo_full_name: repo.fullName,
        org_id: orgId,
        path: "",
        file_name: "",
        language: "",
        file_role: "",
        area,
        commit_sha: "",
        author: mainAuthor,
        committed_at: mainCreatedAt,
        default_branch: repo.defaultBranch,
        chunk_type: chunkType,
        start_line: 0,
        end_line: 0,
        token_count: this.countTokens(text),
        chunk_index: 0,
        total_chunks: 0,
      });
    }

    return chunks;
  }
}

export const githubChunkingService = new GitHubChunkingService();
