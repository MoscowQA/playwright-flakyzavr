import { test, expect } from '@playwright/test';
import { skipOnError, withSkipOnError } from '../dist';

// ─── Decorator style: withSkipOnError ───────────────────────────

test('decorator: skip on network error', withSkipOnError(
  [/net::ERR_CONNECTION_REFUSED/],
  async ({}) => {
    throw new Error('net::ERR_CONNECTION_REFUSED at navigate');
  },
));

test('decorator: skip on timeout', withSkipOnError(
  [/Timeout \d+ms exceeded/],
  async ({}) => {
    throw new Error('Locator.click: Timeout 30000ms exceeded');
  },
));

test('decorator: real failure — not skipped', withSkipOnError(
  [/net::ERR_CONNECTION_REFUSED/],
  async ({}) => {
    expect(1).toBe(2);
  },
));

test('decorator: passing test — not affected', withSkipOnError(
  [/any_pattern/],
  async ({}) => {
    expect(1 + 1).toBe(2);
  },
));

// ─── Inline style: skipOnError ──────────────────────────────────

test('inline: skip on network error', async ({}) => {
  await skipOnError([/net::ERR_CONNECTION_REFUSED/], async () => {
    throw new Error('net::ERR_CONNECTION_REFUSED at navigate');
  });
});

test('inline: passing test — not affected', async ({}) => {
  await skipOnError([/any_pattern/], async () => {
    expect(1 + 1).toBe(2);
  });
});
