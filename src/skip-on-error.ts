import { test } from '@playwright/test';

type SkipPattern = string | RegExp;

function compilePatterns(patterns: SkipPattern[]): RegExp[] {
  return patterns.map(p => typeof p === 'string' ? new RegExp(p) : p);
}

function matchesAny(message: string, compiled: RegExp[]): RegExp | undefined {
  return compiled.find(pattern => pattern.test(message));
}

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
  const compiled = compilePatterns(patterns);

  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const matched = matchesAny(message, compiled);
    if (matched) {
      test.skip(true, `Skipped: error matched pattern ${matched}`);
    }
    throw error;
  }
}

/**
 * Decorator-style wrapper for a Playwright test function.
 * If the test throws an error matching one of the patterns, it is skipped.
 *
 * Playwright parses the test function signature to extract fixture names,
 * so we override toString() on the wrapper to expose the original function's
 * signature. This lets Playwright see the destructured fixtures correctly.
 *
 * Usage:
 *   import { test } from '@playwright/test';
 *   import { withSkipOnError } from 'playwright-flakyzavr';
 *
 *   test('my test', withSkipOnError([/net::ERR_CONNECTION_REFUSED/], async ({ page }) => {
 *     await page.goto('http://localhost:3000');
 *   }));
 */
export function withSkipOnError<F extends (...args: any[]) => Promise<void>>(
  patterns: SkipPattern[],
  fn: F,
): F {
  const compiled = compilePatterns(patterns);

  const wrapper = async function (this: unknown, ...args: unknown[]) {
    try {
      await fn.apply(this, args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const matched = matchesAny(message, compiled);
      if (matched) {
        test.skip(true, `Skipped: error matched pattern ${matched}`);
      }
      throw error;
    }
  };

  // Playwright calls fn.toString() to parse fixture names from
  // the destructuring pattern. We proxy toString to the original
  // function so Playwright sees the correct signature.
  wrapper.toString = () => fn.toString();

  return wrapper as F;
}

/**
 * TC39 stage 3 class method decorator.
 * If the method throws an error matching one of the patterns,
 * the current Playwright test is marked as "skipped" instead of "failed".
 *
 * Usage:
 *   import { SkipOnError } from 'playwright-flakyzavr';
 *
 *   class LoginPage {
 *     @SkipOnError([/net::ERR_CONNECTION_REFUSED/])
 *     async open(page: Page) {
 *       await page.goto('http://localhost:3000/login');
 *     }
 *   }
 */
export function SkipOnError<This, Args extends any[], Return>(patterns: SkipPattern[]) {
  const compiled = compilePatterns(patterns);

  return function (
    target: (this: This, ...args: Args) => Promise<Return>,
    _context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Promise<Return>>,
  ) {
    async function replacementMethod(this: This, ...args: Args): Promise<Return> {
      try {
        return await target.call(this, ...args);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const matched = matchesAny(message, compiled);
        if (matched) {
          test.skip(true, `Skipped: error matched pattern ${matched}`);
        }
        throw error;
      }
    }

    return replacementMethod;
  };
}
