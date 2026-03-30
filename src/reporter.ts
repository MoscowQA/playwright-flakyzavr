import path from 'path';
import type {
  Reporter,
  TestCase,
  TestResult,
  FullConfig,
  Suite,
  FullResult,
} from '@playwright/test/reporter';

import { FlakyzavrConfig, ReportingLangSet } from './types.js';
import { JiraClient } from './jira-client.js';
import { getLangSet, renderTemplate } from './messages.js';

interface FailureRecord {
  testName: string;
  testPath: string;
  errorMessage: string;
  traceback: string;
  jobLink: string;
}

export class FlakyzavrReporter implements Reporter {
  private config: Required<Pick<FlakyzavrConfig, 'jiraServer' | 'jiraToken' | 'jiraProject'>> &
    FlakyzavrConfig;
  private lang: ReportingLangSet;
  private client: JiraClient | null = null;
  private exceptionPatterns: RegExp[];

  private stats = { created: 0, commented: 0, filtered: 0, errors: 0 };
  private pendingFailures = new Map<string, FailureRecord[]>();

  constructor(config: FlakyzavrConfig) {
    this.validateConfig(config);

    this.config = {
      jiraLabels: ['flaky'],
      jiraIssueTypeId: 'Bug',
      jiraSearchStatuses: ['Open', 'In Progress', 'Reopened'],
      reportEnabled: true,
      dryRun: false,
      reportProjectName: config.jiraProject,
      reportingLang: 'en',
      ...config,
    };

    this.lang = getLangSet(this.config.reportingLang!);
    this.exceptionPatterns = (this.config.exceptions ?? []).map((p) => new RegExp(p));
  }

  private validateConfig(config: FlakyzavrConfig): void {
    const missing: string[] = [];
    if (!config.jiraServer) missing.push('jiraServer');
    if (!config.jiraToken) missing.push('jiraToken');
    if (!config.jiraProject) missing.push('jiraProject');

    if (missing.length > 0) {
      throw new Error(
        `[flakyzavr] Missing required config: ${missing.join(', ')}. ` +
          `Provide them in playwright.config.ts reporter options.`,
      );
    }

    try {
      new URL(config.jiraServer);
    } catch {
      throw new Error(
        `[flakyzavr] Invalid jiraServer URL: "${config.jiraServer}". ` +
          `Must be a valid URL (e.g. "https://jira.example.com").`,
      );
    }

    if (config.jiraAuthType === 'cloud' && !config.jiraEmail) {
      throw new Error(`[flakyzavr] jiraEmail is required when jiraAuthType is "cloud".`);
    }
  }

  private getClient(): JiraClient {
    if (!this.client) {
      this.client = new JiraClient({
        server: this.config.jiraServer,
        token: this.config.jiraToken,
        authType: this.config.jiraAuthType,
        email: this.config.jiraEmail,
        retryAttempts: this.config.retryAttempts,
        retryDelay: this.config.retryDelay,
      });
    }
    return this.client;
  }

  onBegin(_config: FullConfig, _suite: Suite): void {
    // no-op
  }

  async onTestEnd(test: TestCase, result: TestResult): Promise<void> {
    if (!this.config.reportEnabled) return;
    if (result.status === 'passed' || result.status === 'skipped') return;

    const testName = test.titlePath().slice(1).join(' > ');
    const errorMessage = result.error?.message ?? 'Unknown error';

    if (this.isExceptionFiltered(errorMessage)) {
      console.log(renderTemplate(this.lang.exceptionFiltered, { testName }));
      this.stats.filtered++;
      return;
    }

    const jobLink = this.buildJobLink();

    if (this.config.dryRun) {
      console.log(renderTemplate(this.lang.dryRun, { testName }));
      return;
    }

    const failure: FailureRecord = {
      testName,
      testPath: test.location.file,
      errorMessage,
      traceback: result.error?.stack ?? '',
      jobLink,
    };

    if (this.config.groupByFileThreshold !== undefined) {
      const fileKey = path.relative(process.cwd(), test.location.file);
      const list = this.pendingFailures.get(fileKey) ?? [];
      list.push(failure);
      this.pendingFailures.set(fileKey, list);
    } else {
      const issueTestName = this.getIssueTestName(test);
      await this.reportFailure(issueTestName, failure);
    }
  }

  async onEnd(_result: FullResult): Promise<void> {
    if (!this.config.reportEnabled) return;

    if (this.config.groupByFileThreshold !== undefined) {
      const threshold = this.config.groupByFileThreshold;
      for (const [fileKey, failures] of this.pendingFailures) {
        if (failures.length >= threshold) {
          await this.reportFileGroup(fileKey, failures);
        } else {
          for (const failure of failures) {
            await this.reportFailure(failure.testName, failure);
          }
        }
      }
    }

    const { created, commented, filtered, errors } = this.stats;
    if (created || commented || filtered || errors) {
      console.log(
        `[flakyzavr] Summary: ${created} created, ${commented} commented, ` +
          `${filtered} filtered, ${errors} errors`,
      );
    }
  }

  private async reportFileGroup(fileKey: string, failures: FailureRecord[]): Promise<void> {
    const first = failures[0];
    const testNames = failures.map((f) => f.testName).join('\n- ');
    const combinedErrors = failures
      .map((f) => `[${f.testName}]\n${f.errorMessage}`)
      .join('\n\n---\n\n');
    const combinedTracebacks = failures
      .map((f) => `[${f.testName}]\n${f.traceback}`)
      .join('\n\n---\n\n');

    const groupDescription =
      `h3. Multiple tests failed in the same file\n\n` +
      `*File:* ${fileKey}\n` +
      `*Failed tests (${failures.length}):*\n- ${testNames}\n\n` +
      `h3. Errors\n{noformat}${combinedErrors}{noformat}\n\n` +
      `h3. Stack traces\n{noformat}${combinedTracebacks}{noformat}\n\n` +
      (first.jobLink ? `[Job link|${first.jobLink}]\n` : '');

    const groupComment =
      `h3. Tests failed again in ${fileKey}\n\n` +
      `*Failed tests (${failures.length}):*\n- ${testNames}\n\n` +
      (first.jobLink ? `[Job link|${first.jobLink}]\n` : '');

    await this.reportFailure(fileKey, first, groupDescription, groupComment);
  }

  private async reportFailure(
    issueTestName: string,
    failure: FailureRecord,
    overrideDescription?: string,
    overrideComment?: string,
  ): Promise<void> {
    const { testName, testPath, errorMessage, traceback, jobLink } = failure;
    try {
      const client = this.getClient();

      const searchResult = await client.searchIssues(
        this.config.jiraProject,
        issueTestName,
        this.config.jiraLabels!,
        this.config.jiraSearchStatuses!,
      );

      if (searchResult.total > 0) {
        const existingIssue = searchResult.issues[0];
        const comment =
          overrideComment ??
          renderTemplate(this.lang.commentTemplate, {
            testName,
            error: errorMessage,
            traceback,
            jobLink,
            failureCount: String(searchResult.total + 1),
          });

        await client.addComment(existingIssue.key, comment);
        console.log(
          renderTemplate(this.lang.issueExists, {
            issueKey: existingIssue.key,
            testName: issueTestName,
          }),
        );
        this.stats.commented++;
      } else {
        const summary = renderTemplate(this.lang.summaryTemplate, {
          testName: issueTestName,
          projectName: this.config.reportProjectName!,
        });
        const description =
          overrideDescription ??
          renderTemplate(this.lang.descriptionTemplate, {
            testName,
            testPath,
            error: errorMessage,
            traceback,
            jobLink,
            projectName: this.config.reportProjectName!,
          });

        const created = await client.createIssue({
          project: this.config.jiraProject,
          summary,
          description,
          issueType: this.config.jiraIssueTypeId!,
          components: this.config.jiraComponents,
          labels: this.config.jiraLabels,
          additionalData: this.config.jiraAdditionalData,
        });

        console.log(
          renderTemplate(this.lang.issueCreated, {
            issueKey: created.key,
            testName: issueTestName,
          }),
        );
        this.stats.created++;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(renderTemplate(this.lang.jiraUnavailable, { error: errorMsg }));
      this.stats.errors++;
    }
  }

  private getIssueTestName(test: TestCase): string {
    if (this.config.groupByFile) {
      return path.relative(process.cwd(), test.location.file);
    }
    return test.titlePath().slice(1).join(' > ');
  }

  private isExceptionFiltered(errorMessage: string): boolean {
    return this.exceptionPatterns.some((pattern) => pattern.test(errorMessage));
  }

  private buildJobLink(): string {
    if (!this.config.jobPath) return '';

    const jobId = process.env.CI_JOB_ID ?? process.env.BUILD_ID ?? process.env.GITHUB_RUN_ID ?? '';

    return this.config.jobPath.replace('{job_id}', jobId);
  }
}
