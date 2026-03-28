import { JiraSearchResult, JiraCreateResult } from './types.js';

export interface JiraClientConfig {
  server: string;
  token: string;
  authType?: 'cloud' | 'server';
  email?: string;
  retryAttempts?: number;
  retryDelay?: number;
}

export class JiraClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly retryAttempts: number;
  private readonly retryDelay: number;

  constructor(config: JiraClientConfig) {
    this.baseUrl = config.server.replace(/\/+$/, '') + '/rest/api/2';
    this.retryAttempts = config.retryAttempts ?? 3;
    this.retryDelay = config.retryDelay ?? 1000;

    const authType = config.authType ?? 'server';
    let authorization: string;

    if (authType === 'cloud') {
      if (!config.email) {
        throw new Error('[flakyzavr] jiraEmail is required when jiraAuthType is "cloud"');
      }
      const credentials = Buffer.from(`${config.email}:${config.token}`).toString('base64');
      authorization = `Basic ${credentials}`;
    } else {
      authorization = `Bearer ${config.token}`;
    }

    this.headers = {
      Authorization: authorization,
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
    const response = await this.fetchWithRetry(url, { method: 'GET', headers: this.headers });

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

    const response = await this.fetchWithRetry(`${this.baseUrl}/issue`, {
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
    const response = await this.fetchWithRetry(`${this.baseUrl}/issue/${issueKey}/comment`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ body }),
    });

    if (!response.ok) {
      throw new Error(`Jira add comment failed: ${response.status} ${response.statusText}`);
    }
  }

  private async fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await fetch(url, options);

        // Don't retry client errors (4xx), only server errors (5xx) and network failures
        if (response.ok || (response.status >= 400 && response.status < 500)) {
          return response;
        }

        lastError = new Error(`HTTP ${response.status} ${response.statusText}`);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }

      if (attempt < this.retryAttempts) {
        const delay = this.retryDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  private escapeJql(value: string): string {
    return value.replace(/[\\"]/g, '\\$&');
  }
}
