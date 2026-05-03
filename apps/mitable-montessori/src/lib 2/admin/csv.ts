/**
 * Tiny CSV parser. Handles quoted fields with embedded commas / newlines /
 * escaped quotes ("" → "). Not a full RFC 4180 implementation but sufficient
 * for the spreadsheet exports school admins paste in.
 *
 * Returning [headers, ...rows] keeps the consumer in control of mapping; the
 * mapping step is where the LLM-assisted column-mapping (Phase 4 Week 12)
 * plugs in.
 */

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  rowCount: number;
}

export function parseCsv(input: string): ParsedCsv {
  const lines: string[][] = [];
  let i = 0;
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  while (i < input.length) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r" && input[i + 1] === "\n") {
      row.push(field);
      lines.push(row);
      row = [];
      field = "";
      i += 2;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      lines.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    lines.push(row);
  }

  if (lines.length === 0) {
    return { headers: [], rows: [], rowCount: 0 };
  }
  const [headers, ...rest] = lines;
  // Drop fully-empty rows.
  const rows = rest.filter((r) => r.some((c) => c.trim() !== ""));
  return { headers: headers.map((h) => h.trim()), rows, rowCount: rows.length };
}

export interface RosterImportRow {
  first_name: string;
  last_name: string;
  preferred_name?: string;
  birth_date?: string;
}

export interface RosterImportConflict {
  row: number;
  reason: "duplicate_name" | "missing_field" | "invalid_date";
  detail: string;
}

export interface RosterImportPlan {
  rows: RosterImportRow[];
  conflicts: RosterImportConflict[];
}

/**
 * Maps a parsed CSV to roster rows + conflicts. Headers are matched
 * case-insensitively against the canonical field names and a small alias set.
 */
export function planRosterImport(
  csv: ParsedCsv,
  existingNames: ReadonlySet<string>
): RosterImportPlan {
  const headerIndex = new Map<string, number>();
  const aliases: Record<string, string[]> = {
    first_name: ["first name", "firstname", "given name", "first"],
    last_name: ["last name", "lastname", "family name", "surname", "last"],
    preferred_name: ["preferred name", "nickname", "called"],
    birth_date: ["birth date", "birthday", "dob", "date of birth"],
  };
  for (let i = 0; i < csv.headers.length; i++) {
    const h = csv.headers[i].toLowerCase();
    for (const [canonical, alts] of Object.entries(aliases)) {
      if (h === canonical || alts.includes(h)) {
        headerIndex.set(canonical, i);
        break;
      }
    }
  }

  const rows: RosterImportRow[] = [];
  const conflicts: RosterImportConflict[] = [];

  csv.rows.forEach((cells, idx) => {
    const get = (name: string) => {
      const i = headerIndex.get(name);
      return i === undefined ? undefined : (cells[i]?.trim() ?? undefined);
    };
    const first = get("first_name");
    const last = get("last_name");
    if (!first || !last) {
      conflicts.push({
        row: idx + 2,
        reason: "missing_field",
        detail: "first_name and last_name required",
      });
      return;
    }
    const birth = get("birth_date");
    if (birth && !/^\d{4}-\d{2}-\d{2}$/.test(birth)) {
      conflicts.push({
        row: idx + 2,
        reason: "invalid_date",
        detail: `birth_date must be YYYY-MM-DD, got '${birth}'`,
      });
      return;
    }
    const fullKey = `${first.toLowerCase()} ${last.toLowerCase()}`;
    if (existingNames.has(fullKey)) {
      conflicts.push({
        row: idx + 2,
        reason: "duplicate_name",
        detail: `${first} ${last} already exists in roster`,
      });
      return;
    }
    rows.push({
      first_name: first,
      last_name: last,
      preferred_name: get("preferred_name") || undefined,
      birth_date: birth || undefined,
    });
  });

  return { rows, conflicts };
}
