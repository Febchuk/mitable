/**
 * Admin-side tokenizer. Phase 4 expands the token namespace from Phase 1's
 * three kinds (student / subtopic / classroom) to seven, matching the entity
 * model the admin agent operates on. Stable token assignment per entity id, so
 * the agent can correlate references across multiple read-tool calls within a
 * single agent session.
 */

export type AdminTokenKind =
  | "student"
  | "guardian"
  | "user"
  | "classroom"
  | "curriculum"
  | "topic"
  | "subtopic";

export interface AdminTokenRef {
  id: string;
  token: string;
  display: string;
  kind: AdminTokenKind;
}

export class AdminTokenizer {
  private byKind = new Map<AdminTokenKind, Map<string, AdminTokenRef>>();
  private counters = new Map<AdminTokenKind, number>();

  private prefix(kind: AdminTokenKind) {
    switch (kind) {
      case "student":
        return "STUDENT";
      case "guardian":
        return "GUARDIAN";
      case "user":
        return "USER";
      case "classroom":
        return "CLASSROOM";
      case "curriculum":
        return "CURRICULUM";
      case "topic":
        return "TOPIC";
      case "subtopic":
        return "SUBTOPIC";
    }
  }

  token(kind: AdminTokenKind, id: string, display: string): string {
    let bucket = this.byKind.get(kind);
    if (!bucket) {
      bucket = new Map();
      this.byKind.set(kind, bucket);
    }
    let entry = bucket.get(id);
    if (!entry) {
      const next = (this.counters.get(kind) ?? 0) + 1;
      this.counters.set(kind, next);
      entry = { id, token: `[${this.prefix(kind)}_${next}]`, display, kind };
      bucket.set(id, entry);
    } else if (display && !entry.display) {
      entry.display = display;
    }
    return entry.token;
  }

  references(): AdminTokenRef[] {
    const out: AdminTokenRef[] = [];
    for (const bucket of this.byKind.values()) {
      for (const ref of bucket.values()) out.push(ref);
    }
    return out;
  }

  /** Reverse-lookup: token → ref. Used by tool dispatchers to resolve UUIDs. */
  resolve(token: string): AdminTokenRef | null {
    for (const bucket of this.byKind.values()) {
      for (const ref of bucket.values()) {
        if (ref.token === token) return ref;
      }
    }
    return null;
  }

  /** Used when restoring a tokenizer from a persisted reference set (agent session resume). */
  static from(refs: AdminTokenRef[]): AdminTokenizer {
    const t = new AdminTokenizer();
    for (const r of refs) {
      const bucket = t.byKind.get(r.kind) ?? new Map();
      bucket.set(r.id, r);
      t.byKind.set(r.kind, bucket);
      const idx = parseInt(r.token.match(/\d+/)?.[0] ?? "0", 10);
      const cur = t.counters.get(r.kind) ?? 0;
      if (idx > cur) t.counters.set(r.kind, idx);
    }
    return t;
  }
}
