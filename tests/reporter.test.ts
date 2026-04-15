import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlakyzavrReporter } from '../src/reporter.js';
import type { FlakyzavrConfig } from '../src/types.js';

// Mock JiraClient
vi.mock('../src/jira-client.js', () => {
  return {
    JiraClient: vi.fn().mockImplementation(() => ({
      searchIssues: vi.fn(),
      createIssue: vi.fn(),
      addComment: vi.fn(),
    })),
  };
});

import { JiraClient } from '../src/jira-client.js';

const MockedJiraClient = vi.mocked(JiraClient);

function makeTestCase(overrides?: Partial<{ title: string; file: string }>) {
  return {
    titlePath: () => ['', 'login.spec.ts', overrides?.title ?? 'should login'],
    location: { file: overrides?.file ?? 'tests/login.spec.ts', line: 1, column: 1 },
    id: 'test-1',
    title: overrides?.title ?? 'should login',
  } as any;
}

function makeTestResult(
  overrides?: Partial<{
    status: string;
    message: string;
    stack: string;
    snippet: string;
    attachments: { name: string; contentType: string; body?: Buffer }[];
  }>,
) {
  return {
    status: overrides?.status ?? 'failed',
    error: {
      message: overrides?.message ?? 'Element not found',
      stack: overrides?.stack ?? 'Error: Element not found\n    at test.ts:42',
      snippet: overrides?.snippet ?? '',
    },
    attachments: overrides?.attachments ?? [],
  } as any;
}

const baseConfig: FlakyzavrConfig = {
  jiraServer: 'https://jira.example.com',
  jiraToken: 'token',
  jiraProject: 'QA',
};

describe('FlakyzavrReporter', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('config validation', () => {
    it('throws on missing jiraServer', () => {
      expect(() => new FlakyzavrReporter({ ...baseConfig, jiraServer: '' })).toThrow(
        'Missing required config: jiraServer',
      );
    });

    it('throws on missing jiraToken', () => {
      expect(() => new FlakyzavrReporter({ ...baseConfig, jiraToken: '' })).toThrow(
        'Missing required config: jiraToken',
      );
    });

    it('throws on missing jiraProject', () => {
      expect(() => new FlakyzavrReporter({ ...baseConfig, jiraProject: '' })).toThrow(
        'Missing required config: jiraProject',
      );
    });

    it('throws on multiple missing fields', () => {
      expect(
        () => new FlakyzavrReporter({ jiraServer: '', jiraToken: '', jiraProject: '' }),
      ).toThrow('jiraServer, jiraToken, jiraProject');
    });

    it('throws on invalid jiraServer URL', () => {
      expect(() => new FlakyzavrReporter({ ...baseConfig, jiraServer: 'not-a-url' })).toThrow(
        'Invalid jiraServer URL',
      );
    });

    it('throws on cloud auth without email', () => {
      expect(() => new FlakyzavrReporter({ ...baseConfig, jiraAuthType: 'cloud' })).toThrow(
        'jiraEmail is required',
      );
    });

    it('accepts valid config without error', () => {
      expect(() => new FlakyzavrReporter(baseConfig)).not.toThrow();
    });

    it('accepts cloud config with email', () => {
      expect(
        () =>
          new FlakyzavrReporter({
            ...baseConfig,
            jiraAuthType: 'cloud',
            jiraEmail: 'user@example.com',
          }),
      ).not.toThrow();
    });
  });

  it('skips passed tests', async () => {
    const reporter = new FlakyzavrReporter(baseConfig);
    await reporter.onTestEnd(makeTestCase(), makeTestResult({ status: 'passed' }));
    expect(MockedJiraClient).not.toHaveBeenCalled();
  });

  it('logs quarantined message for skipped tests without creating Jira issues', async () => {
    const reporter = new FlakyzavrReporter(baseConfig);
    await reporter.onTestEnd(makeTestCase(), makeTestResult({ status: 'skipped' }));
    expect(MockedJiraClient).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Quarantined (skipped)'));
  });

  it('includes quarantined count in summary', async () => {
    const reporter = new FlakyzavrReporter(baseConfig);
    await reporter.onTestEnd(makeTestCase(), makeTestResult({ status: 'skipped' }));
    await reporter.onEnd({ status: 'passed', startTime: new Date(), duration: 0 } as any);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('1 quarantined'));
  });

  it('skips when reportEnabled is false', async () => {
    const reporter = new FlakyzavrReporter({ ...baseConfig, reportEnabled: false });
    await reporter.onTestEnd(makeTestCase(), makeTestResult());
    expect(MockedJiraClient).not.toHaveBeenCalled();
  });

  it('filters exceptions matching regex patterns', async () => {
    const reporter = new FlakyzavrReporter({
      ...baseConfig,
      exceptions: ['Element not found'],
    });

    await reporter.onTestEnd(makeTestCase(), makeTestResult({ message: 'Element not found' }));

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Skipped (exception filtered)'),
    );
    expect(MockedJiraClient).not.toHaveBeenCalled();
  });

  it('logs dry-run message without creating issues', async () => {
    const reporter = new FlakyzavrReporter({ ...baseConfig, dryRun: true });

    await reporter.onTestEnd(makeTestCase(), makeTestResult());

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[DRY RUN]'));
  });

  it('creates new issue when no existing issue found', async () => {
    const mockCreate = vi.fn().mockResolvedValue({ key: 'QA-42', id: '42', self: '' });
    const mockSearch = vi.fn().mockResolvedValue({ total: 0, issues: [] });

    MockedJiraClient.mockImplementation(
      () =>
        ({
          searchIssues: mockSearch,
          createIssue: mockCreate,
          addComment: vi.fn(),
        }) as any,
    );

    const reporter = new FlakyzavrReporter(baseConfig);
    await reporter.onTestEnd(makeTestCase(), makeTestResult());

    expect(mockSearch).toHaveBeenCalledOnce();
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('QA-42'));
  });

  it('adds comment when existing issue found', async () => {
    const mockComment = vi.fn().mockResolvedValue(undefined);
    const mockSearch = vi.fn().mockResolvedValue({
      total: 1,
      issues: [{ key: 'QA-10', fields: { summary: 'old', status: { name: 'Open' } } }],
    });

    MockedJiraClient.mockImplementation(
      () =>
        ({
          searchIssues: mockSearch,
          createIssue: vi.fn(),
          addComment: mockComment,
        }) as any,
    );

    const reporter = new FlakyzavrReporter(baseConfig);
    await reporter.onTestEnd(makeTestCase(), makeTestResult());

    expect(mockComment).toHaveBeenCalledWith('QA-10', expect.any(String));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('QA-10'));
  });

  it('handles Jira unavailability gracefully', async () => {
    const mockSearch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    MockedJiraClient.mockImplementation(
      () =>
        ({
          searchIssues: mockSearch,
          createIssue: vi.fn(),
          addComment: vi.fn(),
        }) as any,
    );

    const reporter = new FlakyzavrReporter(baseConfig);
    await reporter.onTestEnd(makeTestCase(), makeTestResult());

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Connection refused'));
  });

  it('uses RU language templates', async () => {
    const reporter = new FlakyzavrReporter({ ...baseConfig, dryRun: true, reportingLang: 'ru' });
    await reporter.onTestEnd(makeTestCase(), makeTestResult());

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[DRY RUN]'));
  });

  describe('groupByFile', () => {
    function makeParamTestCase(param: string) {
      return {
        titlePath: () => ['', `suite ${param}`, 'should work'],
        location: { file: '/project/tests/login.spec.ts', line: 1, column: 1 },
        id: `test-${param}`,
        title: 'should work',
      } as any;
    }

    it('searches by file path when groupByFile is true', async () => {
      const mockSearch = vi.fn().mockResolvedValue({ total: 0, issues: [] });
      const mockCreate = vi.fn().mockResolvedValue({ key: 'QA-1', id: '1', self: '' });

      MockedJiraClient.mockImplementation(
        () => ({ searchIssues: mockSearch, createIssue: mockCreate, addComment: vi.fn() }) as any,
      );

      const reporter = new FlakyzavrReporter({ ...baseConfig, groupByFile: true });
      await reporter.onTestEnd(makeParamTestCase('admin'), makeTestResult());

      const searchArg = mockSearch.mock.calls[0][1] as string;
      expect(searchArg).toContain('login.spec.ts');
    });

    it('two variants from the same file search with the same key', async () => {
      const mockSearch = vi.fn().mockResolvedValue({ total: 0, issues: [] });
      const mockCreate = vi.fn().mockResolvedValue({ key: 'QA-1', id: '1', self: '' });

      MockedJiraClient.mockImplementation(
        () => ({ searchIssues: mockSearch, createIssue: mockCreate, addComment: vi.fn() }) as any,
      );

      const reporter = new FlakyzavrReporter({ ...baseConfig, groupByFile: true });
      await reporter.onTestEnd(makeParamTestCase('admin'), makeTestResult());
      await reporter.onTestEnd(makeParamTestCase('user'), makeTestResult());

      expect(mockSearch.mock.calls[0][1]).toBe(mockSearch.mock.calls[1][1]);
    });

    it('includes full test name in description', async () => {
      const mockSearch = vi.fn().mockResolvedValue({ total: 0, issues: [] });
      const mockCreate = vi.fn().mockResolvedValue({ key: 'QA-1', id: '1', self: '' });

      MockedJiraClient.mockImplementation(
        () => ({ searchIssues: mockSearch, createIssue: mockCreate, addComment: vi.fn() }) as any,
      );

      const reporter = new FlakyzavrReporter({ ...baseConfig, groupByFile: true });
      await reporter.onTestEnd(makeParamTestCase('admin'), makeTestResult());

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringContaining('suite admin > should work'),
        }),
      );
    });

    it('adds comment with full test name when second variant fails', async () => {
      const mockComment = vi.fn().mockResolvedValue(undefined);
      const mockSearch = vi.fn().mockResolvedValue({
        total: 1,
        issues: [{ key: 'QA-10', fields: { summary: 'old', status: { name: 'Open' } } }],
      });

      MockedJiraClient.mockImplementation(
        () =>
          ({
            searchIssues: mockSearch,
            createIssue: vi.fn(),
            addComment: mockComment,
          }) as any,
      );

      const reporter = new FlakyzavrReporter({ ...baseConfig, groupByFile: true });
      await reporter.onTestEnd(makeParamTestCase('user'), makeTestResult());

      expect(mockComment).toHaveBeenCalledWith(
        'QA-10',
        expect.stringContaining('suite user > should work'),
      );
    });

    it('uses full test name for search when groupByFile is not set', async () => {
      const mockSearch = vi.fn().mockResolvedValue({ total: 0, issues: [] });
      const mockCreate = vi.fn().mockResolvedValue({ key: 'QA-1', id: '1', self: '' });

      MockedJiraClient.mockImplementation(
        () => ({ searchIssues: mockSearch, createIssue: mockCreate, addComment: vi.fn() }) as any,
      );

      const reporter = new FlakyzavrReporter(baseConfig);
      await reporter.onTestEnd(makeParamTestCase('admin'), makeTestResult());

      expect(mockSearch).toHaveBeenCalledWith(
        'QA',
        'suite admin > should work',
        expect.any(Array),
        expect.any(Array),
      );
    });
  });

  describe('groupByFileThreshold', () => {
    function makeFileTestCase(title: string, file = '/project/tests/login.spec.ts') {
      return {
        titlePath: () => ['', 'suite', title],
        location: { file, line: 1, column: 1 },
        id: title,
        title,
      } as any;
    }

    it('creates individual tickets when failures are below threshold', async () => {
      const mockSearch = vi.fn().mockResolvedValue({ total: 0, issues: [] });
      const mockCreate = vi.fn().mockResolvedValue({ key: 'QA-1', id: '1', self: '' });

      MockedJiraClient.mockImplementation(
        () => ({ searchIssues: mockSearch, createIssue: mockCreate, addComment: vi.fn() }) as any,
      );

      const reporter = new FlakyzavrReporter({ ...baseConfig, groupByFileThreshold: 3 });
      await reporter.onTestEnd(makeFileTestCase('test A'), makeTestResult());
      await reporter.onTestEnd(makeFileTestCase('test B'), makeTestResult());
      await reporter.onEnd({ status: 'failed', startTime: new Date(), duration: 0 } as any);

      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(mockSearch.mock.calls[0][1]).toBe('suite > test A');
      expect(mockSearch.mock.calls[1][1]).toBe('suite > test B');
    });

    it('creates one file-level ticket when failures reach threshold', async () => {
      const mockSearch = vi.fn().mockResolvedValue({ total: 0, issues: [] });
      const mockCreate = vi.fn().mockResolvedValue({ key: 'QA-1', id: '1', self: '' });

      MockedJiraClient.mockImplementation(
        () => ({ searchIssues: mockSearch, createIssue: mockCreate, addComment: vi.fn() }) as any,
      );

      const reporter = new FlakyzavrReporter({ ...baseConfig, groupByFileThreshold: 3 });
      await reporter.onTestEnd(makeFileTestCase('test A'), makeTestResult());
      await reporter.onTestEnd(makeFileTestCase('test B'), makeTestResult());
      await reporter.onTestEnd(makeFileTestCase('test C'), makeTestResult());
      await reporter.onEnd({ status: 'failed', startTime: new Date(), duration: 0 } as any);

      expect(mockCreate).toHaveBeenCalledTimes(1);
      const searchKey = mockSearch.mock.calls[0][1] as string;
      expect(searchKey).toContain('login.spec.ts');
    });

    it('file ticket description lists all failed tests', async () => {
      const mockSearch = vi.fn().mockResolvedValue({ total: 0, issues: [] });
      const mockCreate = vi.fn().mockResolvedValue({ key: 'QA-1', id: '1', self: '' });

      MockedJiraClient.mockImplementation(
        () => ({ searchIssues: mockSearch, createIssue: mockCreate, addComment: vi.fn() }) as any,
      );

      const reporter = new FlakyzavrReporter({ ...baseConfig, groupByFileThreshold: 2 });
      await reporter.onTestEnd(makeFileTestCase('test A'), makeTestResult());
      await reporter.onTestEnd(makeFileTestCase('test B'), makeTestResult());
      await reporter.onEnd({ status: 'failed', startTime: new Date(), duration: 0 } as any);

      const description = mockCreate.mock.calls[0][0].description as string;
      expect(description).toContain('suite > test A');
      expect(description).toContain('suite > test B');
    });

    it('groups tests from the same file but keeps other files separate', async () => {
      const mockSearch = vi.fn().mockResolvedValue({ total: 0, issues: [] });
      const mockCreate = vi.fn().mockResolvedValue({ key: 'QA-1', id: '1', self: '' });

      MockedJiraClient.mockImplementation(
        () => ({ searchIssues: mockSearch, createIssue: mockCreate, addComment: vi.fn() }) as any,
      );

      const reporter = new FlakyzavrReporter({ ...baseConfig, groupByFileThreshold: 2 });
      // 2 failures from login.spec.ts → grouped
      await reporter.onTestEnd(
        makeFileTestCase('test A', '/project/tests/login.spec.ts'),
        makeTestResult(),
      );
      await reporter.onTestEnd(
        makeFileTestCase('test B', '/project/tests/login.spec.ts'),
        makeTestResult(),
      );
      // 1 failure from other.spec.ts → individual
      await reporter.onTestEnd(
        makeFileTestCase('test X', '/project/tests/other.spec.ts'),
        makeTestResult(),
      );
      await reporter.onEnd({ status: 'failed', startTime: new Date(), duration: 0 } as any);

      expect(mockCreate).toHaveBeenCalledTimes(2);
      const searchKeys = mockSearch.mock.calls.map((c) => c[1] as string);
      expect(searchKeys.some((k) => k.includes('login.spec.ts'))).toBe(true);
      expect(searchKeys.some((k) => k === 'suite > test X')).toBe(true);
    });
  });

  describe('groupSameError', () => {
    it('creates one ticket when multiple tests fail with the same error', async () => {
      const mockSearch = vi.fn().mockResolvedValue({ total: 0, issues: [] });
      const mockCreate = vi.fn().mockResolvedValue({ key: 'QA-1', id: '1', self: '' });

      MockedJiraClient.mockImplementation(
        () => ({ searchIssues: mockSearch, createIssue: mockCreate, addComment: vi.fn() }) as any,
      );

      const reporter = new FlakyzavrReporter({ ...baseConfig, groupSameError: true });
      const error = 'Error: Connection refused\n    at connect (db.ts:10)';
      await reporter.onTestEnd(
        makeTestCase({ title: 'test A' }),
        makeTestResult({ message: error }),
      );
      await reporter.onTestEnd(
        makeTestCase({ title: 'test B' }),
        makeTestResult({ message: error }),
      );
      await reporter.onTestEnd(
        makeTestCase({ title: 'test C' }),
        makeTestResult({ message: error }),
      );
      await reporter.onEnd({ status: 'failed', startTime: new Date(), duration: 0 } as any);

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockSearch.mock.calls[0][1]).toBe('Error: Connection refused');
    });

    it('ticket description lists all affected tests', async () => {
      const mockSearch = vi.fn().mockResolvedValue({ total: 0, issues: [] });
      const mockCreate = vi.fn().mockResolvedValue({ key: 'QA-1', id: '1', self: '' });

      MockedJiraClient.mockImplementation(
        () => ({ searchIssues: mockSearch, createIssue: mockCreate, addComment: vi.fn() }) as any,
      );

      const reporter = new FlakyzavrReporter({ ...baseConfig, groupSameError: true });
      const error = 'TimeoutError: page load exceeded\n    at page.goto (test.ts:5)';
      await reporter.onTestEnd(
        makeTestCase({ title: 'test A' }),
        makeTestResult({ message: error }),
      );
      await reporter.onTestEnd(
        makeTestCase({ title: 'test B' }),
        makeTestResult({ message: error }),
      );
      await reporter.onEnd({ status: 'failed', startTime: new Date(), duration: 0 } as any);

      const description = mockCreate.mock.calls[0][0].description as string;
      expect(description).toContain('login.spec.ts > test A');
      expect(description).toContain('login.spec.ts > test B');
    });

    it('creates separate tickets for different errors', async () => {
      const mockSearch = vi.fn().mockResolvedValue({ total: 0, issues: [] });
      const mockCreate = vi.fn().mockResolvedValue({ key: 'QA-1', id: '1', self: '' });

      MockedJiraClient.mockImplementation(
        () => ({ searchIssues: mockSearch, createIssue: mockCreate, addComment: vi.fn() }) as any,
      );

      const reporter = new FlakyzavrReporter({ ...baseConfig, groupSameError: true });
      await reporter.onTestEnd(
        makeTestCase({ title: 'test A' }),
        makeTestResult({ message: 'Error: DB down' }),
      );
      await reporter.onTestEnd(
        makeTestCase({ title: 'test B' }),
        makeTestResult({ message: 'Error: Auth failed' }),
      );
      await reporter.onEnd({ status: 'failed', startTime: new Date(), duration: 0 } as any);

      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('creates individual ticket when only one test has a given error', async () => {
      const mockSearch = vi.fn().mockResolvedValue({ total: 0, issues: [] });
      const mockCreate = vi.fn().mockResolvedValue({ key: 'QA-1', id: '1', self: '' });

      MockedJiraClient.mockImplementation(
        () => ({ searchIssues: mockSearch, createIssue: mockCreate, addComment: vi.fn() }) as any,
      );

      const reporter = new FlakyzavrReporter({ ...baseConfig, groupSameError: true });
      await reporter.onTestEnd(
        makeTestCase({ title: 'test A' }),
        makeTestResult({ message: 'Unique error A' }),
      );
      await reporter.onTestEnd(
        makeTestCase({ title: 'test B' }),
        makeTestResult({ message: 'Unique error B' }),
      );
      await reporter.onEnd({ status: 'failed', startTime: new Date(), duration: 0 } as any);

      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(mockSearch.mock.calls[0][1]).toBe('login.spec.ts > test A');
      expect(mockSearch.mock.calls[1][1]).toBe('login.spec.ts > test B');
    });
  });

  it('prints summary on end', async () => {
    const mockSearch = vi.fn().mockResolvedValue({ total: 0, issues: [] });
    const mockCreate = vi.fn().mockResolvedValue({ key: 'QA-1', id: '1', self: '' });

    MockedJiraClient.mockImplementation(
      () =>
        ({
          searchIssues: mockSearch,
          createIssue: mockCreate,
          addComment: vi.fn(),
        }) as any,
    );

    const reporter = new FlakyzavrReporter(baseConfig);
    await reporter.onTestEnd(makeTestCase(), makeTestResult());
    await reporter.onEnd({ status: 'failed', startTime: new Date(), duration: 1000 } as any);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Summary: 1 created'));
  });

  describe('snippet and page snapshot', () => {
    it('includes source snippet in issue description', async () => {
      const mockSearch = vi.fn().mockResolvedValue({ total: 0, issues: [] });
      const mockCreate = vi.fn().mockResolvedValue({ key: 'QA-1', id: '1', self: '' });

      MockedJiraClient.mockImplementation(
        () => ({ searchIssues: mockSearch, createIssue: mockCreate, addComment: vi.fn() }) as any,
      );

      const reporter = new FlakyzavrReporter(baseConfig);
      await reporter.onTestEnd(
        makeTestCase(),
        makeTestResult({
          snippet: '> 31 |   await this.registerButton.click();',
        }),
      );

      const description = mockCreate.mock.calls[0][0].description as string;
      expect(description).toContain('Source');
      expect(description).toContain('registerButton.click()');
    });

    it('includes page snapshot from attachments in issue description', async () => {
      const mockSearch = vi.fn().mockResolvedValue({ total: 0, issues: [] });
      const mockCreate = vi.fn().mockResolvedValue({ key: 'QA-1', id: '1', self: '' });

      MockedJiraClient.mockImplementation(
        () => ({ searchIssues: mockSearch, createIssue: mockCreate, addComment: vi.fn() }) as any,
      );

      const snapshot = '- button "Sign up" [ref=e50]';
      const reporter = new FlakyzavrReporter(baseConfig);
      await reporter.onTestEnd(
        makeTestCase(),
        makeTestResult({
          attachments: [
            { name: 'page-snapshot', contentType: 'text/plain', body: Buffer.from(snapshot) },
          ],
        }),
      );

      const description = mockCreate.mock.calls[0][0].description as string;
      expect(description).toContain('Page snapshot');
      expect(description).toContain('Sign up');
    });

    it('omits snapshot section when no snapshot attachment present', async () => {
      const mockSearch = vi.fn().mockResolvedValue({ total: 0, issues: [] });
      const mockCreate = vi.fn().mockResolvedValue({ key: 'QA-1', id: '1', self: '' });

      MockedJiraClient.mockImplementation(
        () => ({ searchIssues: mockSearch, createIssue: mockCreate, addComment: vi.fn() }) as any,
      );

      const reporter = new FlakyzavrReporter(baseConfig);
      await reporter.onTestEnd(makeTestCase(), makeTestResult());

      const description = mockCreate.mock.calls[0][0].description as string;
      expect(description).not.toContain('Page snapshot');
    });

    it('includes test line number in description', async () => {
      const mockSearch = vi.fn().mockResolvedValue({ total: 0, issues: [] });
      const mockCreate = vi.fn().mockResolvedValue({ key: 'QA-1', id: '1', self: '' });

      MockedJiraClient.mockImplementation(
        () => ({ searchIssues: mockSearch, createIssue: mockCreate, addComment: vi.fn() }) as any,
      );

      const reporter = new FlakyzavrReporter(baseConfig);
      await reporter.onTestEnd(
        {
          titlePath: () => ['', 'suite', 'test'],
          location: { file: 'tests/login.spec.ts', line: 42, column: 5 },
          id: 'test-1',
          title: 'test',
        } as any,
        makeTestResult(),
      );

      const description = mockCreate.mock.calls[0][0].description as string;
      expect(description).toContain('tests/login.spec.ts:42');
    });

    it('includes snippet and snapshot in comment on existing issue', async () => {
      const mockComment = vi.fn().mockResolvedValue(undefined);
      const mockSearch = vi.fn().mockResolvedValue({
        total: 1,
        issues: [{ key: 'QA-10', fields: { summary: 'old', status: { name: 'Open' } } }],
      });

      MockedJiraClient.mockImplementation(
        () =>
          ({
            searchIssues: mockSearch,
            createIssue: vi.fn(),
            addComment: mockComment,
          }) as any,
      );

      const reporter = new FlakyzavrReporter(baseConfig);
      await reporter.onTestEnd(
        makeTestCase(),
        makeTestResult({
          snippet: '> 31 |   await btn.click();',
          attachments: [
            {
              name: 'aria-snapshot',
              contentType: 'text/plain',
              body: Buffer.from('- button "Submit"'),
            },
          ],
        }),
      );

      const comment = mockComment.mock.calls[0][1] as string;
      expect(comment).toContain('Source');
      expect(comment).toContain('btn.click()');
      expect(comment).toContain('Page snapshot');
      expect(comment).toContain('Submit');
    });

    it('uses RU headers when reportingLang is ru', async () => {
      const mockSearch = vi.fn().mockResolvedValue({ total: 0, issues: [] });
      const mockCreate = vi.fn().mockResolvedValue({ key: 'QA-1', id: '1', self: '' });

      MockedJiraClient.mockImplementation(
        () => ({ searchIssues: mockSearch, createIssue: mockCreate, addComment: vi.fn() }) as any,
      );

      const reporter = new FlakyzavrReporter({ ...baseConfig, reportingLang: 'ru' });
      await reporter.onTestEnd(
        makeTestCase(),
        makeTestResult({
          snippet: '> 31 |   await btn.click();',
          attachments: [
            {
              name: 'page-snapshot',
              contentType: 'text/plain',
              body: Buffer.from('- button "OK"'),
            },
          ],
        }),
      );

      const description = mockCreate.mock.calls[0][0].description as string;
      expect(description).toContain('Source');
      expect(description).toContain('Page snapshot');
    });
  });
});
