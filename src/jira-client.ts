import { Version2Client } from 'jira.js';
import { JiraSearchResult, JiraCreateResult } from './types.js';

export interface JiraClientConfig {
  server: string;
  token: string;
  authType?: 'cloud' | 'server';
  email?: string;
}

export class JiraClient {
  private readonly client: Version2Client;

  constructor(config: JiraClientConfig) {
    const authType = config.authType ?? 'server';

    if (authType === 'cloud' && !config.email) {
      throw new Error('[flakyzavr] jiraEmail is required when jiraAuthType is "cloud"');
    }

    this.client = new Version2Client({
      host: config.server.replace(/\/+$/, ''),
      authentication:
        authType === 'cloud'
          ? { basic: { email: config.email!, apiToken: config.token } }
          : { oauth2: { accessToken: config.token } },
    });
  }

  async searchIssues(
    project: string,
    testIdentifier: string,
    labels: string[],
    statuses: string[],
  ): Promise<JiraSearchResult> {
    const statusJql = statuses.map((s) => `"${s}"`).join(', ');
    const labelJql = labels.map((l) => `"${l}"`).join(', ');

    const jql = [
      `project = "${project}"`,
      `status in (${statusJql})`,
      `labels in (${labelJql})`,
      `summary ~ "${this.escapeJql(testIdentifier)}"`,
    ].join(' AND ');

    const result = await this.client.issueSearch.searchForIssuesUsingJql({ jql, maxResults: 1 });

    return {
      total: result.total ?? 0,
      issues: (result.issues ?? []).map((i) => ({
        key: i.key,
        fields: {
          summary: i.fields?.summary ?? '',
          status: { name: i.fields?.status?.name ?? '' },
        },
      })),
    };
  }

  async createIssue(params: {
    project: string;
    summary: string;
    description: string;
    issueType: string;
    components?: string[];
    labels?: string[];
    additionalData?: Record<string, unknown>;
  }): Promise<JiraCreateResult> {
    const fields: Record<string, unknown> = {
      project: { key: params.project },
      summary: params.summary,
      description: params.description,
      issuetype: { name: params.issueType },
    };

    if (params.labels?.length) {
      fields.labels = params.labels;
    }

    if (params.components?.length) {
      fields.components = params.components.map((name) => ({ name }));
    }

    if (params.additionalData) {
      Object.assign(fields, params.additionalData);
    }

    const created = await this.client.issues.createIssue({
      fields: fields as Parameters<Version2Client['issues']['createIssue']>[0]['fields'],
    });

    return {
      key: created.key,
      id: created.id,
      self: created.self,
    };
  }

  async addComment(issueKey: string, body: string): Promise<void> {
    await this.client.issueComments.addComment({ issueIdOrKey: issueKey, comment: body });
  }

  private escapeJql(value: string): string {
    return value.replace(/[\\"]/g, '\\$&');
  }
}
