/**
 * Storyteller RLM Environment
 *
 * Holds the block.md content for a session. The storyteller reads it via
 * tools (get_block_overview, read_block, get_transcripts) and produces
 * a summary narrative — no sub-LLM calls needed.
 */

export interface BlockMetadata {
  totalLines: number;
  totalChars: number;
  batchCount: number;
  apps: string[];
  duration: string | null;
  hasTranscripts: boolean;
  transcriptCount: number;
}

export interface TranscriptLine {
  lineNumber: number;
  text: string;
}

export class StorytellerEnvironment {
  public readonly sessionId: string;
  public readonly lines: string[];
  public readonly transcriptLines: TranscriptLine[];
  public readonly metadata: BlockMetadata;

  constructor(opts: { sessionId: string; blockContent: string }) {
    this.sessionId = opts.sessionId;
    this.lines = opts.blockContent.split("\n");

    this.transcriptLines = [];
    for (let i = 0; i < this.lines.length; i++) {
      if (this.lines[i].startsWith("> **Audio")) {
        this.transcriptLines.push({ lineNumber: i + 1, text: this.lines[i] });
      }
    }

    const batchHeaders = this.lines.filter((l) => l.startsWith("### "));
    const apps = new Set<string>();
    for (const line of this.lines) {
      const appMatch = line.match(/\| ([A-Za-z][\w\s.]+?) \[/);
      if (appMatch) apps.add(appMatch[1].trim());
    }

    let duration: string | null = null;
    for (const line of this.lines) {
      const durMatch = line.match(/\*\*Time:\*\*\s*(.+)/);
      if (durMatch) {
        duration = durMatch[1].trim();
        break;
      }
    }

    this.metadata = {
      totalLines: this.lines.length,
      totalChars: opts.blockContent.length,
      batchCount: batchHeaders.length,
      apps: [...apps],
      duration,
      hasTranscripts: this.transcriptLines.length > 0,
      transcriptCount: this.transcriptLines.length,
    };
  }
}
