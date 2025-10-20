/**
 * Notion URL Parser Utility
 *
 * Extracts page IDs from various Notion URL formats.
 * Supports:
 * - Full URLs with workspace: https://notion.so/workspace/Page-Title-abc123def456
 * - Short URLs: https://notion.so/Page-Title-abc123def456
 * - URLs with query params: https://notion.so/Page-abc123def456?pvs=4
 * - Direct page IDs: abc123def456
 */

/**
 * Extracts a clean Notion page ID from a URL or direct ID string
 *
 * @param input - Notion URL or direct page ID
 * @returns Clean 32-character page ID without hyphens
 * @throws Error if URL is invalid or page ID cannot be extracted
 *
 * @example
 * extractNotionPageId('https://notion.so/My-Page-abc123def456')
 * // Returns: 'abc123def456'
 *
 * @example
 * extractNotionPageId('abc123def456')
 * // Returns: 'abc123def456'
 */
export function extractNotionPageId(input: string): string {
  if (!input || typeof input !== "string") {
    throw new Error("Notion URL or page ID is required");
  }

  const trimmed = input.trim();

  // Check if it's already a valid page ID (32 hex characters, possibly with hyphens)
  const directIdMatch = trimmed.match(/^([a-f0-9]{32}|[a-f0-9-]{36})$/i);
  if (directIdMatch) {
    return trimmed.replace(/-/g, "");
  }

  // Validate it's a Notion URL
  if (!trimmed.includes("notion.so")) {
    throw new Error(
      "Invalid Notion URL. Please provide a valid Notion page link (e.g., https://notion.so/Page-abc123)"
    );
  }

  // Extract page ID from URL
  // Notion URLs typically end with the page ID (32 hex chars)
  // Format: https://notion.so/workspace/Page-Title-<32-char-id>?query=params
  // The page ID is always the last 32 characters before query params or end of URL

  // Remove query parameters first
  const urlWithoutQuery = trimmed.split("?")[0];

  // Remove trailing slash if present
  const cleanUrl = urlWithoutQuery.replace(/\/$/, "");

  // Extract the last segment of the URL path
  const pathSegments = cleanUrl.split("/");
  const lastSegment = pathSegments[pathSegments.length - 1];

  if (!lastSegment) {
    throw new Error("Invalid Notion URL format. Could not find a valid page ID");
  }

  // Page ID is typically at the end of the last segment after the last hyphen
  // Format examples:
  // - "Page-Title-abc123def456" → "abc123def456"
  // - "abc123def456" → "abc123def456"
  // - "Page-Title-abc123def456ghi789" → "abc123def456ghi789"

  // Try to extract a 32-character hex string from the last segment
  const pageIdMatch = lastSegment.match(/([a-f0-9]{32})$/i);

  if (!pageIdMatch) {
    throw new Error(
      "Invalid Notion URL format. Could not find a valid page ID. " +
        "Notion page IDs are 32 characters long. Please ensure the URL is correct."
    );
  }

  const pageId = pageIdMatch[1];

  // Validate the extracted ID is exactly 32 hex characters
  if (!/^[a-f0-9]{32}$/i.test(pageId)) {
    throw new Error("Extracted page ID is not valid. Expected 32 hexadecimal characters.");
  }

  return pageId;
}
