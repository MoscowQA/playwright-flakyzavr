import { test, expect } from '@playwright/test';

test('passing test — should not trigger flakyzavr', async () => {
  expect(1 + 1).toBe(2);
});

test('failing test — should trigger flakyzavr dry-run', async () => {
  expect(1 + 1).toBe(3);
});

test('another failing test with timeout-like error', async () => {
  await new Promise((resolve) => setTimeout(resolve, 50));
  throw new Error('Locator.click: Timeout 30000ms exceeded');
});
