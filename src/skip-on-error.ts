import { test } from '@playwright/test';

type SkipPattern = string | RegExp;

/**
 * Wraps an async block inside a Playwright test: if the block throws an error
 * matching one of the given patterns, the test is marked as "skipped" instead of "failed".
 *
 * Usage:
 *   import { test } from '@playwright/test';
 *   import { skipOnError } from 'playwright-flakyzavr';
 *
 *   test('my test', async ({ page }) => {
 *     await skipOnError([/net::ERR_CONNECTION_REFUSED/], async () => {
 *       await page.goto('http://localhost:3000');
 *     });
 *   });
 */
export async function skipOnError(
  patterns: SkipPattern[],
  fn: () => Promise<void>,
): Promise<void> {
  const compiled = patterns.map(p =>
    typeof p === 'string' ? new RegExp(p) : p,
  );

  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    for (const pattern of compiled) {
      if (pattern.test(message)) {
        test.skip(true, `Skipped: error matched pattern ${pattern}`);
      }
    }
    throw error;
  }
}
