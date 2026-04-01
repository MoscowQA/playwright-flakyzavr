import {test} from '@playwright/test';

// ─── Shared utilities ────────────────────────────────────────────────────────

type SkipPattern = string | RegExp;

export const compilePatterns = (patterns: SkipPattern[]): RegExp[] =>
    patterns.map((p) =>
        p instanceof RegExp ? p : new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );

function matchesAny(message: string, compiled: RegExp[]): RegExp | undefined {
  return compiled.find((pattern) => pattern.test(message));
}

// eslint-disable-next-line no-control-regex
const stripAnsi = (str: string) => str.replace(/\x1B\[[0-9;]*m/g, '');

function extractErrorText(error: unknown): string {
  const raw =
      error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  return stripAnsi(raw);
}

function handleSkip(error: unknown, compiled: RegExp[]): void {
  const matched = matchesAny(extractErrorText(error), compiled);
  if (matched) {
    test.skip(true, `Skipped: error matched pattern ${matched}`);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

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
    handleSkip(error, compiled);
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
      handleSkip(error, compiled);
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
 * Class method decorator (supports both legacy experimentalDecorators and TC39 Stage 3).
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
export const SkipOnError =
    (skipPatterns: SkipPattern[]) =>
        <Fn, Args extends unknown[]>(
            target: (this: Fn, ...args: Args) => Promise<Fn>,
            _: ClassMethodDecoratorContext,
        ) => {
          const compiled = compilePatterns(skipPatterns);

          async function replacementMethod(this: Fn, ...args: Args): Promise<Fn | void> {
            try {
              return await target.call(this, ...args);
            } catch (error) {
              handleSkip(error, compiled);
              throw error;
            }
          }

          return replacementMethod;
        };