import { test, expect } from '@playwright/test';
import { skipOnError } from '../dist';

test('skip on network error', async ({}) => {
  await skipOnError([/net::ERR_CONNECTION_REFUSED/], async () => {
    // This error matches the pattern — test will be SKIPPED, not FAILED
    throw new Error('net::ERR_CONNECTION_REFUSED at navigate');
  });
});

test('skip on timeout', async ({}) => {
  await skipOnError([/Timeout \d+ms exceeded/], async () => {
    // This error matches the pattern — test will be SKIPPED
    throw new Error('Locator.click: Timeout 30000ms exceeded');
  });
});

test('real failure — not skipped', async ({}) => {
  await skipOnError([/net::ERR_CONNECTION_REFUSED/], async () => {
    // This error does NOT match — test will FAIL normally
    expect(1).toBe(2);
  });
});

test('passing test — not affected', async ({}) => {
  await skipOnError([/any_pattern/], async () => {
    // Passing test — skipOnError does nothing
    expect(1 + 1).toBe(2);
  });
});
