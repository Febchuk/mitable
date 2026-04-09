/**
 * Workstream RLM Environment
 *
 * Holds all session data (captures, workstreams, assignments) in memory.
 * The LLM interacts with this environment through tools, building up
 * workstream groupings iteratively instead of in one massive prompt.
 */

export interface WorkstreamCapture {
  id: string;
  capturedAt: Date;
  appName: string | null;
  windowTitle: string | null;
  activityDescription: string | null;
}

export interface WorkstreamDef {
  id: string;
  name: string;
  summary: string;
  category: string;
  captureIds: string[];
  appsUsed: string[];
  isNew: boolean;
}

export interface WorkstreamMerge {
  fromId: string;
  intoId: string;
  reason: string;
}

export interface WorkstreamUpdate {
  name?: string;
  summary?: string;
  category?: string;
}

const PAGE_SIZE = 25;

export class WorkstreamEnvironment {
  readonly captures: WorkstreamCapture[];
  private workstreams: Map<string, WorkstreamDef> = new Map();
  private assignments: Map<string, string> = new Map(); // captureId → workstreamId
  private merges: WorkstreamMerge[] = [];
  private nextTempId = 0;
  private linearIssueTitle: string | null;
  private durationMinutes: number;

  constructor(
    captures: WorkstreamCapture[],
    existingWorkstreams: Array<{
      id: string;
      name: string;
      summary: string | null;
      category: string | null;
      captureCount: number;
      appsUsed: string[];
    }>,
    context: {
      sessionId: string;
      linearIssueTitle: string | null;
      durationMinutes: number;
    }
  ) {
    this.captures = captures;
    this.linearIssueTitle = context.linearIssueTitle;
    this.durationMinutes = context.durationMinutes;

    // Load existing workstreams into environment
    for (const ws of existingWorkstreams) {
      this.workstreams.set(ws.id, {
        id: ws.id,
        name: ws.name,
        summary: ws.summary || "",
        category: ws.category || "other",
        captureIds: [],
        appsUsed: ws.appsUsed || [],
        isNew: false,
      });
    }
  }

  /**
   * Tool: get_session_overview
   * Returns high-level stats without dumping all capture data
   */
  getOverview(): {
    captureCount: number;
    pageSize: number;
    totalPages: number;
    timeRange: { start: string; end: string };
    durationMinutes: number;
    uniqueApps: string[];
    sessionGoal: string;
    existingWorkstreams: number;
  } {
    const apps = new Set<string>();
    for (const c of this.captures) {
      if (c.appName) apps.add(c.appName);
    }

    const sorted = [...this.captures].sort(
      (a, b) => a.capturedAt.getTime() - b.capturedAt.getTime()
    );

    return {
      captureCount: this.captures.length,
      pageSize: PAGE_SIZE,
      totalPages: Math.ceil(this.captures.length / PAGE_SIZE),
      timeRange: {
        start: sorted[0]?.capturedAt.toISOString() || "",
        end: sorted[sorted.length - 1]?.capturedAt.toISOString() || "",
      },
      durationMinutes: this.durationMinutes,
      uniqueApps: [...apps],
      sessionGoal: this.linearIssueTitle || "General work session",
      existingWorkstreams: this.workstreams.size,
    };
  }

  /**
   * Tool: get_captures
   * Returns a page of captures (max PAGE_SIZE)
   */
  getCaptures(
    start: number,
    end: number
  ): Array<{
    id: string;
    index: number;
    time: string;
    appName: string | null;
    windowTitle: string | null;
    activity: string | null;
    assignedTo: string | null;
  }> {
    const safeStart = Math.max(0, start);
    const safeEnd = Math.min(this.captures.length, end, safeStart + PAGE_SIZE);

    return this.captures.slice(safeStart, safeEnd).map((c, i) => ({
      id: c.id,
      index: safeStart + i,
      time: c.capturedAt.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      appName: c.appName,
      windowTitle: c.windowTitle ? c.windowTitle.substring(0, 60) : null,
      activity: c.activityDescription,
      assignedTo: this.assignments.get(c.id) || null,
    }));
  }

  /**
   * Tool: create_workstream
   */
  createWorkstream(name: string, summary: string, category: string): { id: string; name: string } {
    const id = `NEW:${this.nextTempId++}`;
    this.workstreams.set(id, {
      id,
      name,
      summary,
      category,
      captureIds: [],
      appsUsed: [],
      isNew: true,
    });
    return { id, name };
  }

  /**
   * Tool: assign_captures
   */
  assignCaptures(
    workstreamId: string,
    captureIds: string[]
  ): { assigned: number; workstreamId: string; error?: string } {
    const ws = this.workstreams.get(workstreamId);
    if (!ws) {
      return { assigned: 0, workstreamId, error: `Workstream ${workstreamId} not found` };
    }

    let assigned = 0;
    for (const cid of captureIds) {
      const cap = this.captures.find((c) => c.id === cid);
      if (cap) {
        this.assignments.set(cid, workstreamId);
        if (!ws.captureIds.includes(cid)) {
          ws.captureIds.push(cid);
        }
        if (cap.appName && !ws.appsUsed.includes(cap.appName)) {
          ws.appsUsed.push(cap.appName);
        }
        assigned++;
      }
    }

    return { assigned, workstreamId };
  }

  /**
   * Tool: update_workstream
   */
  updateWorkstream(
    workstreamId: string,
    updates: WorkstreamUpdate
  ): { updated: boolean; error?: string } {
    const ws = this.workstreams.get(workstreamId);
    if (!ws) {
      return { updated: false, error: `Workstream ${workstreamId} not found` };
    }

    if (updates.name) ws.name = updates.name;
    if (updates.summary) ws.summary = updates.summary;
    if (updates.category) ws.category = updates.category;

    return { updated: true };
  }

  /**
   * Tool: merge_workstreams
   */
  mergeWorkstreams(
    fromId: string,
    intoId: string,
    reason: string
  ): { merged: boolean; error?: string } {
    const from = this.workstreams.get(fromId);
    const into = this.workstreams.get(intoId);

    if (!from) return { merged: false, error: `Source workstream ${fromId} not found` };
    if (!into) return { merged: false, error: `Target workstream ${intoId} not found` };

    // Move all captures from 'from' into 'into'
    for (const cid of from.captureIds) {
      this.assignments.set(cid, intoId);
      if (!into.captureIds.includes(cid)) {
        into.captureIds.push(cid);
      }
    }

    // Merge apps
    for (const app of from.appsUsed) {
      if (!into.appsUsed.includes(app)) {
        into.appsUsed.push(app);
      }
    }

    this.merges.push({ fromId, intoId, reason });
    this.workstreams.delete(fromId);

    return { merged: true };
  }

  /**
   * Tool: list_workstreams
   */
  listWorkstreams(): Array<{
    id: string;
    name: string;
    summary: string;
    category: string;
    captureCount: number;
    appsUsed: string[];
    isNew: boolean;
  }> {
    return [...this.workstreams.values()].map((ws) => ({
      id: ws.id,
      name: ws.name,
      summary: ws.summary,
      category: ws.category,
      captureCount: ws.captureIds.length,
      appsUsed: ws.appsUsed,
      isNew: ws.isNew,
    }));
  }

  /**
   * Get final results to apply to DB
   */
  getResults(): {
    assignments: Record<string, string>;
    newWorkstreams: Array<{
      tempId: string;
      name: string;
      summary: string;
      category: string;
    }>;
    updates: Record<string, WorkstreamUpdate>;
    merges: WorkstreamMerge[];
  } {
    const assignments: Record<string, string> = {};
    for (const [captureId, wsId] of this.assignments) {
      assignments[captureId] = wsId;
    }

    const newWorkstreams = [...this.workstreams.values()]
      .filter((ws) => ws.isNew)
      .map((ws) => ({
        tempId: ws.id,
        name: ws.name,
        summary: ws.summary,
        category: ws.category,
      }));

    const updates: Record<string, WorkstreamUpdate> = {};
    for (const ws of this.workstreams.values()) {
      if (!ws.isNew) {
        updates[ws.id] = {
          name: ws.name,
          summary: ws.summary,
          category: ws.category,
        };
      }
    }

    return { assignments, newWorkstreams, updates, merges: this.merges };
  }

  /**
   * Stats for logging
   */
  getAssignmentStats(): {
    totalCaptures: number;
    assignedCaptures: number;
    unassignedCaptures: number;
    workstreamCount: number;
  } {
    return {
      totalCaptures: this.captures.length,
      assignedCaptures: this.assignments.size,
      unassignedCaptures: this.captures.length - this.assignments.size,
      workstreamCount: this.workstreams.size,
    };
  }
}
