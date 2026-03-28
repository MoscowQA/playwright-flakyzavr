import { test, expect } from '@playwright/test';
import { skipOnError, withSkipOnError, SkipOnError } from '../dist';

// ─── Class method decorator: @SkipOnError ───────────────────────

class LoginPage {
  @SkipOnError([/net::ERR_CONNECTION_REFUSED/])
  async open() {
    throw new Error('net::ERR_CONNECTION_REFUSED at navigate');
  }

  @SkipOnError([/timeout/i])
  async submit() {
    return 'submitted';
  }
}

test('class decorator: skip on network error in page object', async ({}) => {
  const page = new LoginPage();
  await page.open();
});

test('class decorator: passing method — not affected', async ({}) => {
  const page = new LoginPage();
  const result = await page.submit();
  expect(result).toBe('submitted');
});

// ─── Wrapper style: withSkipOnError ─────────────────────────────

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
