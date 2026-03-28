import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlakyzavrReporter } from '../src/reporter';
import type { FlakyzavrConfig } from '../src/types';

// Mock JiraClient
vi.mock('../src/jira-client', () => {
  return {
    JiraClient: vi.fn().mockImplementation(() => ({
      searchIssues: vi.fn(),
      createIssue: vi.fn(),
      addComment: vi.fn(),
    })),
  };
});

import { JiraClient } from '../src/jira-client';

const MockedJiraClient = vi.mocked(JiraClient);

function makeTestCase(overrides?: Partial<{ title: string; file: string }>) {
  return {
    titlePath: () => ['', 'login.spec.ts', overrides?.title ?? 'should login'],
    location: { file: overrides?.file ?? 'tests/login.spec.ts', line: 1, column: 1 },
    id: 'test-1',
    title: overrides?.title ?? 'should login',
  } as any;
}

function makeTestResult(overrides?: Partial<{ status: string; message: string; stack: string }>) {
  return {
    status: overrides?.status ?? 'failed',
    error: {
      message: overrides?.message ?? 'Element not found',
      stack: overrides?.stack ?? 'Error: Element not found\n    at test.ts:42',
    },
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

    it('accepts valid config without error', () => {
      expect(() => new FlakyzavrReporter(baseConfig)).not.toThrow();
    });
  });

  it('skips passed tests', async () => {
    const reporter = new FlakyzavrReporter(baseConfig);
    await reporter.onTestEnd(makeTestCase(), makeTestResult({ status: 'passed' }));
    expect(MockedJiraClient).not.toHaveBeenCalled();
  });

  it('skips skipped tests', async () => {
    const reporter = new FlakyzavrReporter(baseConfig);
    await reporter.onTestEnd(makeTestCase(), makeTestResult({ status: 'skipped' }));
    expect(MockedJiraClient).not.toHaveBeenCalled();
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
});
