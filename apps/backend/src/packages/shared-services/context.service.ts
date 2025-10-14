import type { FormattedContext, ContextOptions } from "../shared-types/context.types";

/**
 * Extract and format context from Pinecone matches
 */
export function formatContext(options: ContextOptions): FormattedContext[] {
  const { matches, scoreThreshold = 0.2, useLooseThreshold = false, boostDocuments = true } = options;
  
  // Use lower threshold for date-filtered queries
  const threshold = useLooseThreshold ? 0.15 : scoreThreshold;
  
  console.log(`Formatting ${matches.length} matches with threshold ${threshold}`);
  
  // Sort matches
  const sortedMatches = [...matches].sort((a, b) => {
    // If document boosting is disabled, just sort by score
    if (!boostDocuments) {
      return (b.score || 0) - (a.score || 0);
    }
    
    // Boost documents over chat messages
    const aIsDoc = a.metadata?.source === 'google-drive' || a.metadata?.fileType === 'PDF';
    const bIsDoc = b.metadata?.source === 'google-drive' || b.metadata?.fileType === 'PDF';
    
    // If both are docs or both are chat, sort by score
    if (aIsDoc === bIsDoc) {
      return (b.score || 0) - (a.score || 0);
    }
    
    // Boost documents: if A is doc and B is chat, A comes first
    return aIsDoc ? -1 : 1;
  });
  
  return sortedMatches
    .filter(match => match.score && match.score > threshold)
    .map((match, i) => {
      const metadata = match.metadata || {};
      
      // Extract content from various possible field names
      const content = metadata.text || metadata.content || metadata.message || metadata.body || "";
      
      if (!content) {
        console.log(`Match ${i + 1}: No content found, skipping`);
        return null;
      }
      
      // Detect source type
      const isSlackMessage = !!(metadata.channelId || metadata.messageId || metadata.user);
      const isGoogleDrive = metadata.source === 'google-drive';
      
      let sourceType = "Document";
      let sourceName = "Unknown";
      let timestamp: number | undefined;
      
      if (isSlackMessage) {
        sourceType = "Slack";
        sourceName = `#${metadata.channelId || 'channel'}`;
        if (metadata.user) {
          sourceName += ` (by ${metadata.user})`;
        }
        // Slack: use createdAt (message timestamp)
        timestamp = metadata.createdAt;
      } else if (isGoogleDrive) {
        sourceType = metadata.fileType || "Google Drive";
        sourceName = metadata.fileName || "Unknown";
        if (metadata.owner) {
          sourceName += ` (by ${metadata.owner})`;
        }
        // Google Drive: prefer modifiedTime (shows recent edits), fallback to createdTime
        timestamp = metadata.modifiedTime || metadata.createdTime;
      } else if (metadata.source) {
        sourceType = metadata.source;
        sourceName = metadata.filename || metadata.fileName || metadata.channel || "Unknown";
        timestamp = metadata.uploadedAt || metadata.createdAt;
      } else if (metadata.fileType) {
        sourceType = metadata.fileType;
        sourceName = metadata.filename || metadata.fileName || "Unknown";
        timestamp = metadata.uploadedAt;
      } else if (metadata.format) {
        sourceType = metadata.format;
        sourceName = metadata.filename || metadata.fileName || "Unknown";
        timestamp = metadata.uploadedAt;
      } else {
        sourceName = metadata.filename || metadata.fileName || metadata.channel || "Unknown";
        timestamp = metadata.uploadedAt;
      }
      
      console.log(`Match ${i + 1}: ${sourceType} - ${sourceName}, score=${match.score?.toFixed(3)}, content length=${content.length}`);
      
      // Store full metadata for rich context
      return {
        text: content,
        sourceType,
        sourceName,
        timestamp,
        metadata // Pass through full metadata
      } as FormattedContext & { metadata?: Record<string, any> };
    })
    .filter((ctx) => ctx !== null) as FormattedContext[];
}

/**
 * Build a formatted context string with source attribution
 */
export function buildContextString(contexts: FormattedContext[]): string {
  if (contexts.length === 0) {
    return "No relevant context found.";
  }
  
  const formattedContexts = contexts.map((ctx: any) => {
    const metadata = ctx.metadata || {};
    
    // Build metadata header with all available info
    let metadataLines: string[] = [];
    
    // Basic info
    metadataLines.push(`Source Type: ${ctx.sourceType}`);
    metadataLines.push(`Name: ${ctx.sourceName}`);
    
    // Storage location
    if (metadata.source === 'google-drive') {
      metadataLines.push(`Storage: Google Drive`);
      if (metadata.fileId) metadataLines.push(`File ID: ${metadata.fileId}`);
      if (metadata.webViewLink) metadataLines.push(`Link: ${metadata.webViewLink}`);
    } else if (metadata.source === 'Slack' || metadata.channelId) {
      metadataLines.push(`Storage: Slack`);
      if (metadata.channelId) metadataLines.push(`Channel: #${metadata.channelId}`);
    } else {
      metadataLines.push(`Storage: File System`);
    }
    
    // Ownership
    if (metadata.owner) metadataLines.push(`Owner: ${metadata.owner}`);
    if (metadata.user) metadataLines.push(`Posted by: ${metadata.user}`);
    
    // Timestamps
    if (metadata.createdTime) {
      const created = new Date(metadata.createdTime * 1000);
      metadataLines.push(`Uploaded: ${created.toLocaleDateString()} ${created.toLocaleTimeString()}`);
    }
    if (metadata.modifiedTime) {
      const modified = new Date(metadata.modifiedTime * 1000);
      metadataLines.push(`Last Modified: ${modified.toLocaleDateString()} ${modified.toLocaleTimeString()}`);
    }
    if (metadata.createdAt && !metadata.createdTime) {
      const created = new Date(metadata.createdAt * 1000);
      metadataLines.push(`Created: ${created.toLocaleDateString()} ${created.toLocaleTimeString()}`);
    }
    
    // File details
    if (metadata.size) {
      const sizeKB = Math.round(metadata.size / 1024);
      metadataLines.push(`Size: ${sizeKB} KB`);
    }
    if (metadata.mimeType) metadataLines.push(`Type: ${metadata.mimeType}`);
    
    const header = `[${ctx.sourceType.toUpperCase()}: ${ctx.sourceName}]\n${metadataLines.join('\n')}`;
    
    return `${header}\n\nContent:\n${ctx.text}`;
  });
  
  return formattedContexts.join("\n\n---\n\n");
}
