import { graphRetrievalService } from "./graph-retrieval.service";
import type { GraphContextBlock, UserGraphProfile } from "./types";

class GraphContextBuilderService {
  async buildForUser(userId: string, orgId: string): Promise<GraphContextBlock | undefined> {
    const profile = await graphRetrievalService.getUserGraphProfile(userId, orgId);
    return this.buildContextBlock(profile);
  }

  buildContextBlock(profile: UserGraphProfile): GraphContextBlock | undefined {
    const summaryFacts: string[] = [];
    const personalizationHints: string[] = [];
    const confidenceNotes: string[] = [];

    if (profile.topTasks.length > 0) {
      const taskSummary = profile.topTasks
        .slice(0, 3)
        .map((task) => task.object)
        .join(", ");
      summaryFacts.push(`Most frequent tasks: ${taskSummary}.`);
    }

    if (profile.topApps.length > 0) {
      const appSummary = profile.topApps
        .slice(0, 3)
        .map((app) => app.object)
        .join(", ");
      summaryFacts.push(`Most used apps: ${appSummary}.`);
    }

    for (const pref of profile.preferences.slice(0, 3)) {
      personalizationHints.push(pref.object);
    }

    for (const hint of profile.domains.slice(0, 3)) {
      personalizationHints.push(`${hint.relation}: ${hint.object}`);
    }

    const evidence = profile.topTasks.reduce((acc, item) => acc + item.evidenceCount, 0);
    if (evidence > 0) {
      confidenceNotes.push(`Task profile based on ${evidence} workstream observations.`);
    }

    if (summaryFacts.length === 0 && personalizationHints.length === 0) {
      return undefined;
    }

    return {
      summaryFacts,
      personalizationHints,
      confidenceNotes,
    };
  }
}

export const graphContextBuilderService = new GraphContextBuilderService();
