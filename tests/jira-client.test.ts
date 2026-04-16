import { describe, it, expect, vi, beforeEach } from 'vitest';

const searchForIssuesUsingJql = vi.fn();
const createIssue = vi.fn();
const addComment = vi.fn();
const Version2ClientCtor = vi.fn();

vi.mock('jira.js', () => ({
  Version2Client: class {
    issueSearch = { searchForIssuesUsingJql };
    issues = { createIssue };
    issueComments = { addComment };
    constructor(config: unknown) {
      Version2ClientCtor(config);
    }
  },
}));

const { JiraClient } = await import('../src/jira-client.js');

describe('JiraClient', () => {
  let client: InstanceType<typeof JiraClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new JiraClient({
      server: 'https://jira.example.com',
      token: 'test-token',
    });
  });

  describe('searchIssues', () => {
    it('sends correct JQL and maps result', async () => {
      searchForIssuesUsingJql.mockResolvedValueOnce({
        total: 2,
        issues: [{ key: 'QA-1', fields: { summary: 'S', status: { name: 'Open' } } }],
      });

      const result = await client.searchIssues('QA', 'login test', ['flaky'], ['Open']);

      expect(searchForIssuesUsingJql).toHaveBeenCalledOnce();
      const args = searchForIssuesUsingJql.mock.calls[0][0];
      expect(args.jql).toContain('project = "QA"');
      expect(args.jql).toContain('status in ("Open")');
      expect(args.jql).toContain('labels in ("flaky")');
      expect(args.jql).toContain('summary ~ "login test"');
      expect(args.maxResults).toBe(1);
      expect(result.total).toBe(2);
      expect(result.issues[0].key).toBe('QA-1');
      expect(result.issues[0].fields.status.name).toBe('Open');
    });

    it('handles missing total/issues fields', async () => {
      searchForIssuesUsingJql.mockResolvedValueOnce({});

      const result = await client.searchIssues('QA', 'test', ['flaky'], ['Open']);

      expect(result.total).toBe(0);
      expect(result.issues).toEqual([]);
    });

    it('escapes quotes and backslashes in test identifier', async () => {
      searchForIssuesUsingJql.mockResolvedValueOnce({ total: 0, issues: [] });

      await client.searchIssues('QA', 'has "quote" and \\slash', ['flaky'], ['Open']);

      const jql = searchForIssuesUsingJql.mock.calls[0][0].jql;
      expect(jql).toContain('summary ~ "has \\"quote\\" and \\\\slash"');
    });

    it('propagates library errors', async () => {
      searchForIssuesUsingJql.mockRejectedValueOnce(new Error('Jira search failed: 401'));

      await expect(client.searchIssues('QA', 'test', ['flaky'], ['Open'])).rejects.toThrow(
        'Jira search failed: 401',
      );
    });
  });

  describe('createIssue', () => {
    it('sends correct create request with all fields', async () => {
      createIssue.mockResolvedValueOnce({ key: 'QA-123', id: '123', self: 'url' });

      const result = await client.createIssue({
        project: 'QA',
        summary: 'Flaky test: login',
        description: 'Test failed',
        issueType: 'Bug',
        components: ['UI'],
        labels: ['flaky'],
        additionalData: { priority: { name: 'High' } },
      });

      expect(result).toEqual({ key: 'QA-123', id: '123', self: 'url' });

      const fields = createIssue.mock.calls[0][0].fields;
      expect(fields.project.key).toBe('QA');
      expect(fields.summary).toBe('Flaky test: login');
      expect(fields.issuetype.name).toBe('Bug');
      expect(fields.components).toEqual([{ name: 'UI' }]);
      expect(fields.labels).toEqual(['flaky']);
      expect(fields.priority).toEqual({ name: 'High' });
    });

    it('omits components and labels if not provided', async () => {
      createIssue.mockResolvedValueOnce({ key: 'QA-1', id: '1', self: '' });

      await client.createIssue({
        project: 'QA',
        summary: 'Test',
        description: 'Desc',
        issueType: 'Bug',
      });

      const fields = createIssue.mock.calls[0][0].fields;
      expect(fields.components).toBeUndefined();
      expect(fields.labels).toBeUndefined();
    });

    it('propagates library errors', async () => {
      createIssue.mockRejectedValueOnce(new Error('Jira create issue failed: 400'));

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
      addComment.mockResolvedValueOnce({});

      await client.addComment('QA-123', 'Test failed again');

      expect(addComment).toHaveBeenCalledWith({
        issueIdOrKey: 'QA-123',
        comment: 'Test failed again',
      });
    });

    it('propagates library errors', async () => {
      addComment.mockRejectedValueOnce(new Error('Jira add comment failed: 404'));

      await expect(client.addComment('QA-999', 'comment')).rejects.toThrow(
        'Jira add comment failed: 404',
      );
    });
  });

  describe('server URL normalization', () => {
    it('strips trailing slashes before passing to library', () => {
      new JiraClient({ server: 'https://jira.example.com///', token: 't' });

      expect(Version2ClientCtor).toHaveBeenLastCalledWith(
        expect.objectContaining({ host: 'https://jira.example.com' }),
      );
    });
  });

  describe('auth types', () => {
    it('uses Bearer (oauth2) for server auth (default)', () => {
      new JiraClient({ server: 'https://jira.example.com', token: 'my-token' });

      expect(Version2ClientCtor).toHaveBeenLastCalledWith(
        expect.objectContaining({
          authentication: { oauth2: { accessToken: 'my-token' } },
        }),
      );
    });

    it('uses Basic auth for cloud', () => {
      new JiraClient({
        server: 'https://myorg.atlassian.net',
        token: 'api-token',
        authType: 'cloud',
        email: 'user@example.com',
      });

      expect(Version2ClientCtor).toHaveBeenLastCalledWith(
        expect.objectContaining({
          authentication: { basic: { email: 'user@example.com', apiToken: 'api-token' } },
        }),
      );
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
});
