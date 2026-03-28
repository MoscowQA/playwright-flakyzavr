import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'skip.spec.ts',
  reporter: [['list']],
});
