import { test, expect } from '@playwright/test';

test('filtered error — should be skipped by flakyzavr', async () => {
  throw new Error('net::ERR_CONNECTION_REFUSED — flaky network issue');
});
