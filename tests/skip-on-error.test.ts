import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @playwright/test before importing
vi.mock('@playwright/test', () => ({
  test: {
    skip: vi.fn(),
  },
}));

import { test as playwrightTest } from '@playwright/test';
import { skipOnError, withSkipOnError, SkipOnError } from '../src/skip-on-error.js';

const mockSkip = vi.mocked(playwrightTest.skip);

describe('skipOnError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSkip.mockImplementation(() => {
      throw new Error('SKIP');
    });
  });

  it('does not interfere when block passes', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    await skipOnError([/timeout/i], fn);

    expect(fn).toHaveBeenCalledOnce();
    expect(mockSkip).not.toHaveBeenCalled();
  });

  it('skips when error matches string pattern', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('net::ERR_CONNECTION_REFUSED'));

    await expect(skipOnError(['ERR_CONNECTION_REFUSED'], fn)).rejects.toThrow('SKIP');
    expect(mockSkip).toHaveBeenCalledWith(true, expect.stringContaining('ERR_CONNECTION_REFUSED'));
  });

  it('skips when error matches RegExp pattern', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Timeout 30000ms exceeded'));

    await expect(skipOnError([/timeout.*exceeded/i], fn)).rejects.toThrow('SKIP');
    expect(mockSkip).toHaveBeenCalledWith(true, expect.stringContaining('timeout'));
  });

  it('re-throws original error when no pattern matches', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Assertion failed'));

    await expect(skipOnError([/XYZZY_NO_MATCH/, /PLUGH_NO_MATCH/], fn)).rejects.toThrow('Assertion failed');
    expect(mockSkip).not.toHaveBeenCalled();
  });

  it('checks multiple patterns and skips on first match', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('net::ERR_NETWORK'));

    await expect(skipOnError([/timeout/, /ERR_NETWORK/], fn)).rejects.toThrow('SKIP');
    expect(mockSkip).toHaveBeenCalledOnce();
  });

  it('handles non-Error thrown values', async () => {
    const fn = vi.fn().mockRejectedValue('string error with timeout');

    await expect(skipOnError([/timeout/], fn)).rejects.toThrow('SKIP');
    expect(mockSkip).toHaveBeenCalled();
  });
});

describe('withSkipOnError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSkip.mockImplementation(() => {
      throw new Error('SKIP');
    });
  });

  it('does not interfere when test passes', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const wrapped = withSkipOnError([/timeout/], fn);

    await wrapped({ page: 'mock' });

    expect(fn).toHaveBeenCalledWith({ page: 'mock' });
    expect(mockSkip).not.toHaveBeenCalled();
  });

  it('skips when error matches pattern', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('net::ERR_CONNECTION_REFUSED'));
    const wrapped = withSkipOnError([/ERR_CONNECTION_REFUSED/], fn);

    await expect(wrapped({})).rejects.toThrow('SKIP');
    expect(mockSkip).toHaveBeenCalledWith(true, expect.stringContaining('ERR_CONNECTION_REFUSED'));
  });

  it('re-throws original error when no pattern matches', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Assertion failed'));
    const wrapped = withSkipOnError([/timeout/], fn);

    await expect(wrapped({})).rejects.toThrow('Assertion failed');
    expect(mockSkip).not.toHaveBeenCalled();
  });

  it('proxies toString to original function for Playwright fixture parsing', () => {
    const fn = async ({ page }: { page: string }) => {
      void page;
    };
    const wrapped = withSkipOnError([/err/], fn);

    expect(wrapped.toString()).toBe(fn.toString());
    expect(wrapped.toString()).toContain('page');
  });

  it('passes all arguments through to original function', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const wrapped = withSkipOnError([], fn);

    await wrapped({ page: 'p', request: 'r' });

    expect(fn).toHaveBeenCalledWith({ page: 'p', request: 'r' });
  });
});

describe('SkipOnError (method decorator)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSkip.mockImplementation(() => {
      throw new Error('SKIP');
    });
  });

  it('does not interfere when method succeeds', async () => {
    class Page {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      @SkipOnError([/timeout/])
      async open() {
        return 'ok';
      }
    }

    const page = new Page();
    const result = await page.open();
    expect(result).toBe('ok');
    expect(mockSkip).not.toHaveBeenCalled();
  });

  it('skips when method throws a matching error', async () => {
    class Page {
      @SkipOnError([/ERR_CONNECTION_REFUSED/])
      async open() {
        throw new Error('net::ERR_CONNECTION_REFUSED');
      }
    }

    const page = new Page();
    await expect(page.open()).rejects.toThrow('SKIP');
    expect(mockSkip).toHaveBeenCalledWith(true, expect.stringContaining('ERR_CONNECTION_REFUSED'));
  });

  it('re-throws when error does not match', async () => {
    class Page {
      @SkipOnError([/timeout/])
      async open() {
        throw new Error('Assertion failed');
      }
    }

    const page = new Page();
    await expect(page.open()).rejects.toThrow('Assertion failed');
    expect(mockSkip).not.toHaveBeenCalled();
  });

  it('preserves this context', async () => {
    class Page {
      url = 'http://localhost';

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      @SkipOnError([/timeout/])
      async open() {
        return this.url;
      }
    }

    const page = new Page();
    const result = await page.open();
    expect(result).toBe('http://localhost');
  });

  it('passes arguments through', async () => {
    class Page {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      @SkipOnError([/timeout/])
      async navigate(url: string, options: { wait: boolean }) {
        return `${url}:${options.wait}`;
      }
    }

    const page = new Page();
    const result = await page.navigate('/login', { wait: true });
    expect(result).toBe('/login:true');
  });

  it('works with multiple patterns', async () => {
    class Page {
      @SkipOnError([/timeout/, /ERR_NETWORK/, /ECONNREFUSED/])
      async open() {
        throw new Error('connect ECONNREFUSED 127.0.0.1:3000');
      }
    }

    const page = new Page();
    await expect(page.open()).rejects.toThrow('SKIP');
    expect(mockSkip).toHaveBeenCalledOnce();
  });
});
