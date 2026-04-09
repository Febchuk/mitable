import { App } from "@octokit/app";
import type { Octokit } from "@octokit/core";
import { config } from "../../../config.js";

type InstallationRepository = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  visibility?: string;
  owner: { login: string };
  default_branch: string;
};

class GithubService {
  private app: App;

  constructor() {
    if (!config.github.appId || !config.github.privateKey) {
      throw new Error(
        "GitHub App configuration is missing. Please set GITHUB_APP_ID and PRIVATE_KEY."
      );
    }

    const privateKey = config.github.privateKey.replace(/\\n/g, "\n");

    this.app = new App({
      appId: config.github.appId,
      privateKey,
      oauth: {
        clientId: config.github.clientId,
        clientSecret: config.github.clientSecret,
      },
    });
  }

  async getInstallationOctokit(installationId: number): Promise<Octokit> {
    if (!installationId) {
      throw new Error("Installation ID is required to create an Octokit instance");
    }

    return this.app.getInstallationOctokit(installationId);
  }

  async listInstallationRepos(installationId: number): Promise<InstallationRepository[]> {
    const octokit = await this.getInstallationOctokit(installationId);
    const repositories: InstallationRepository[] = [];
    let page = 1;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const response = await octokit.request("GET /installation/repositories", {
        per_page: 100,
        page,
      });

      repositories.push(...(response.data.repositories as InstallationRepository[]));

      if (response.data.repositories.length < 100) {
        break;
      }

      page += 1;
    }

    return repositories;
  }
}

export const githubService = new GithubService();
export type { InstallationRepository };
