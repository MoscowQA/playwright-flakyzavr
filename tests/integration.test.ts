import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

const root = path.resolve(__dirname, '..');

describe('integration: Playwright with flakyzavr reporter', { timeout: 30_000 }, () => {
  it('dry-run reporter logs messages for failed tests', () => {
    const output = run('example/playwright.config.ts');

    // Reporter should log dry-run messages for failed tests
    expect(output).toContain('[DRY RUN]');
    expect(output).toContain('failing test');
    expect(output).toContain('timeout-like error');
  });

  it('exception filtering skips matching errors', () => {
    const output = run('example/playwright-filtered.config.ts');

    expect(output).toContain('filtered');
    expect(output).toContain('Summary: 0 created, 0 commented, 1 filtered, 0 errors');
  });

  it('skipOnError marks tests as skipped instead of failed', () => {
    const output = run('example/playwright-skip.config.ts');

    // Should have skipped tests (decorator + inline)
    expect(output).toContain('skipped');
  });
});

function run(configPath: string): string {
  try {
    const result = execSync(`npx playwright test --config ${configPath}`, {
      cwd: root,
      encoding: 'utf-8',
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result;
  } catch (err: any) {
    // Playwright exits with code 1 when tests fail — that's expected
    return (err.stdout || '') + (err.stderr || '');
  }
}
