import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  reporter: [
    ['list'],
    ['../dist/index.js', {
      jiraServer: process.env.JIRA_SERVER ?? 'https://jira.example.com',
      jiraToken: process.env.JIRA_TOKEN ?? 'fake-token',
      jiraProject: process.env.JIRA_PROJECT ?? 'QA',
      jiraLabels: ['flaky', 'autotest'],
      reportProjectName: 'podcast',
      jobPath: 'https://ci.example.com/jobs/{job_id}',
      reportingLang: 'ru',
      dryRun: true,
    }],
  ],
});
