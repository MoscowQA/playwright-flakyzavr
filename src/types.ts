export interface ReportingLangSet {
  /** Message when exception is filtered out */
  exceptionFiltered: string;
  /** Message when Jira is unavailable */
  jiraUnavailable: string;
  /** Message when existing issue found */
  issueExists: string;
  /** Message when new issue created */
  issueCreated: string;
  /** Message for dry-run mode */
  dryRun: string;
  /** Template for issue summary. Placeholders: {testName}, {priority} */
  summaryTemplate: string;
  /** Template for issue description. Placeholders: {testName}, {testPath}, {error}, {traceback}, {jobLink}, {projectName} */
  descriptionTemplate: string;
  /** Template for comment on existing issue. Placeholders: {testName}, {error}, {traceback}, {jobLink}, {failureCount} */
  commentTemplate: string;
}

export type ReportingLangKey = 'en' | 'ru';

export interface FlakyzavrConfig {
  /** Jira server URL, e.g. "https://jira.example.com" */
  jiraServer: string;
  /** Jira API token for authentication */
  jiraToken: string;
  /** Jira project key, e.g. "QA" */
  jiraProject: string;

  /** Auth type: "cloud" (Basic with email:token) or "server" (Bearer token). Default: "server" */
  jiraAuthType?: 'cloud' | 'server';
  /** Jira account email, required when jiraAuthType is "cloud" */
  jiraEmail?: string;

  /** Jira components to assign to created issues */
  jiraComponents?: string[];
  /** Jira labels to assign, default: ["flaky"] */
  jiraLabels?: string[];
  /** Jira issue type ID or name, default: "Bug" */
  jiraIssueTypeId?: string;
  /** Jira statuses to search for existing issues, default: ["Open", "In Progress", "Reopened"] */
  jiraSearchStatuses?: string[];
  /** Additional Jira fields to set on created issues */
  jiraAdditionalData?: Record<string, unknown>;

  /** Enable/disable reporting, default: true */
  reportEnabled?: boolean;
  /** Dry-run mode — log only, don't create issues, default: false */
  dryRun?: boolean;
  /** Project name for display in reports */
  reportProjectName?: string;
  /** CI/CD job URL template. Use {job_id} placeholder, e.g. "https://ci.example.com/jobs/{job_id}" */
  jobPath?: string;

  /** Regex patterns for errors to skip (don't create issues for matching errors) */
  exceptions?: string[];

  /** Reporting language: "en" or "ru", default: "en" */
  reportingLang?: ReportingLangKey;

  /** Group parameterized test variants under a single Jira issue. Default: false */
  mergeParamTests?: boolean;
  /** Regex pattern to strip from test names when mergeParamTests is true. Default: \s*\[.*?\] */
  mergeParamPattern?: string;

  /** Number of retry attempts for Jira requests, default: 3 */
  retryAttempts?: number;
  /** Initial delay in ms for exponential backoff, default: 1000 */
  retryDelay?: number;
}

export interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    status: {
      name: string;
    };
  };
}

export interface JiraSearchResult {
  total: number;
  issues: JiraIssue[];
}

export interface JiraCreateResult {
  key: string;
  id: string;
  self: string;
}
