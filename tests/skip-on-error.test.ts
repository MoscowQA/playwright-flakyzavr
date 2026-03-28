import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @playwright/test before importing skipOnError
vi.mock('@playwright/test', () => ({
  test: {
    skip: vi.fn(),
  },
}));

import { test as playwrightTest } from '@playwright/test';
import { skipOnError } from '../src/skip-on-error';

const mockSkip = vi.mocked(playwrightTest.skip);

describe('skipOnError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Simulate Playwright's test.skip() throwing to abort the test
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

    await expect(skipOnError([/timeout/i, /network/i], fn)).rejects.toThrow('Assertion failed');
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
