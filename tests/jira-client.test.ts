import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JiraClient } from '../src/jira-client';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response;
}

describe('JiraClient', () => {
  let client: JiraClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new JiraClient({
      server: 'https://jira.example.com',
      token: 'test-token',
    });
  });

  describe('searchIssues', () => {
    it('sends correct JQL search request', async () => {
      const searchResult = { total: 0, issues: [] };
      mockFetch.mockResolvedValueOnce(jsonResponse(searchResult));

      const result = await client.searchIssues('QA', 'login test', ['flaky'], ['Open']);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('https://jira.example.com/rest/api/2/search');
      expect(url).toContain('project');
      expect(url).toContain('login%20test');
      expect(options.method).toBe('GET');
      expect(options.headers.Authorization).toBe('Bearer test-token');
      expect(result.total).toBe(0);
    });

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 401));

      await expect(client.searchIssues('QA', 'test', ['flaky'], ['Open'])).rejects.toThrow(
        'Jira search failed: 401',
      );
    });
  });

  describe('createIssue', () => {
    it('sends correct create request with all fields', async () => {
      const createResult = { key: 'QA-123', id: '123', self: 'url' };
      mockFetch.mockResolvedValueOnce(jsonResponse(createResult));

      const result = await client.createIssue({
        project: 'QA',
        summary: 'Flaky test: login',
        description: 'Test failed',
        issueType: 'Bug',
        components: ['UI'],
        labels: ['flaky'],
        additionalData: { priority: { name: 'High' } },
      });

      expect(result.key).toBe('QA-123');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://jira.example.com/rest/api/2/issue');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(body.fields.project.key).toBe('QA');
      expect(body.fields.summary).toBe('Flaky test: login');
      expect(body.fields.issuetype.name).toBe('Bug');
      expect(body.fields.components).toEqual([{ name: 'UI' }]);
      expect(body.fields.labels).toEqual(['flaky']);
      expect(body.fields.priority).toEqual({ name: 'High' });
    });

    it('omits components and labels if not provided', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ key: 'QA-1', id: '1', self: '' }));

      await client.createIssue({
        project: 'QA',
        summary: 'Test',
        description: 'Desc',
        issueType: 'Bug',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.fields.components).toBeUndefined();
      expect(body.fields.labels).toBeUndefined();
    });

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ errors: {} }, 400));

      await expect(
        client.createIssue({
          project: 'QA',
          summary: 'Test',
          description: 'Desc',
          issueType: 'Bug',
        }),
      ).rejects.toThrow('Jira create issue failed: 400');
    });
  });

  describe('addComment', () => {
    it('sends correct comment request', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));

      await client.addComment('QA-123', 'Test failed again');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://jira.example.com/rest/api/2/issue/QA-123/comment');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body).body).toBe('Test failed again');
    });

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));

      await expect(client.addComment('QA-999', 'comment')).rejects.toThrow(
        'Jira add comment failed: 404',
      );
    });
  });

  describe('server URL normalization', () => {
    it('strips trailing slashes', async () => {
      const c = new JiraClient({ server: 'https://jira.example.com///', token: 't' });
      mockFetch.mockResolvedValueOnce(jsonResponse({ total: 0, issues: [] }));

      await c.searchIssues('P', 'test', ['l'], ['Open']);

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('https://jira.example.com/rest/api/2/search');
    });
  });

  describe('auth types', () => {
    it('uses Bearer token for server auth (default)', () => {
      const c = new JiraClient({ server: 'https://jira.example.com', token: 'my-token' });
      mockFetch.mockResolvedValueOnce(jsonResponse({ total: 0, issues: [] }));

      c.searchIssues('P', 'test', ['l'], ['Open']);

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers.Authorization).toBe('Bearer my-token');
    });

    it('uses Basic auth for cloud', () => {
      const c = new JiraClient({
        server: 'https://myorg.atlassian.net',
        token: 'api-token',
        authType: 'cloud',
        email: 'user@example.com',
      });
      mockFetch.mockResolvedValueOnce(jsonResponse({ total: 0, issues: [] }));

      c.searchIssues('P', 'test', ['l'], ['Open']);

      const headers = mockFetch.mock.calls[0][1].headers;
      const expected = `Basic ${Buffer.from('user@example.com:api-token').toString('base64')}`;
      expect(headers.Authorization).toBe(expected);
    });

    it('throws if cloud auth without email', () => {
      expect(
        () =>
          new JiraClient({
            server: 'https://myorg.atlassian.net',
            token: 'api-token',
            authType: 'cloud',
          }),
      ).toThrow('jiraEmail is required');
    });
  });

  describe('retry with backoff', () => {
    it('retries on 500 server errors', async () => {
      const c = new JiraClient({
        server: 'https://jira.example.com',
        token: 't',
        retryAttempts: 2,
        retryDelay: 10,
      });

      mockFetch
        .mockResolvedValueOnce(jsonResponse({}, 500))
        .mockResolvedValueOnce(jsonResponse({}, 500))
        .mockResolvedValueOnce(jsonResponse({ total: 0, issues: [] }));

      const result = await c.searchIssues('P', 'test', ['l'], ['Open']);

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.total).toBe(0);
    });

    it('does not retry on 4xx client errors', async () => {
      const c = new JiraClient({
        server: 'https://jira.example.com',
        token: 't',
        retryAttempts: 2,
        retryDelay: 10,
      });

      mockFetch.mockResolvedValueOnce(jsonResponse({}, 401));

      await expect(c.searchIssues('P', 'test', ['l'], ['Open'])).rejects.toThrow(
        'Jira search failed: 401',
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('retries on network errors and throws last error', async () => {
      const c = new JiraClient({
        server: 'https://jira.example.com',
        token: 't',
        retryAttempts: 1,
        retryDelay: 10,
      });

      mockFetch
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockRejectedValueOnce(new Error('ETIMEDOUT'));

      await expect(c.searchIssues('P', 'test', ['l'], ['Open'])).rejects.toThrow('ETIMEDOUT');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('succeeds after network error on retry', async () => {
      const c = new JiraClient({
        server: 'https://jira.example.com',
        token: 't',
        retryAttempts: 2,
        retryDelay: 10,
      });

      mockFetch
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce(jsonResponse({ total: 1, issues: [{ key: 'QA-1' }] }));

      const result = await c.searchIssues('P', 'test', ['l'], ['Open']);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.total).toBe(1);
    });
  });
});
