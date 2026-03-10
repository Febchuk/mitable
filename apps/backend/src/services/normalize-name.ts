/**
 * Normalizes a name by lowercasing and replacing non-alphanumeric chars with hyphens.
 * Used to deduplicate subscriber/topic names that differ only in case or punctuation.
 * e.g. "Acme Corp", "ACME CORP", "acme-corp" all normalize to "acme-corp"
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
