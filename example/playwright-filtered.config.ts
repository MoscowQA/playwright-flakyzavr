import { defineConfig } from '@playwright/test';

/**
 * Example config demonstrating exception filtering.
 * The "net::ERR_CONNECTION_REFUSED" error will be filtered out
 * and flakyzavr will NOT create a Jira issue for it.
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'filtered.spec.ts',
  reporter: [
    ['list'],
    ['../dist/index.js', {
      jiraServer: 'https://jira.example.com',
      jiraToken: 'fake-token',
      jiraProject: 'QA',
      reportProjectName: 'podcast',
      dryRun: true,
      reportingLang: 'en',
      exceptions: ['net::ERR_CONNECTION_REFUSED'],
    }],
  ],
});
