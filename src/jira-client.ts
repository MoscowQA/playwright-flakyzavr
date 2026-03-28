import { JiraSearchResult, JiraCreateResult } from './types';

export interface JiraClientConfig {
  server: string;
  token: string;
}

export class JiraClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(config: JiraClientConfig) {
    this.baseUrl = config.server.replace(/\/+$/, '') + '/rest/api/2';
    this.headers = {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
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

    const url = `${this.baseUrl}/search?jql=${encodeURIComponent(jql)}&maxResults=1`;
    const response = await fetch(url, { method: 'GET', headers: this.headers });

    if (!response.ok) {
      throw new Error(`Jira search failed: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<JiraSearchResult>;
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

    const response = await fetch(`${this.baseUrl}/issue`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ fields }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Jira create issue failed: ${response.status} ${body}`);
    }

    return response.json() as Promise<JiraCreateResult>;
  }

  async addComment(issueKey: string, body: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/issue/${issueKey}/comment`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ body }),
    });

    if (!response.ok) {
      throw new Error(`Jira add comment failed: ${response.status} ${response.statusText}`);
    }
  }

  private escapeJql(value: string): string {
    return value.replace(/[\\"]/g, '\\$&');
  }
}
