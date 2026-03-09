import { afterAll, afterEach, beforeAll } from 'vitest';

import { networkServer } from '@tests/network/server';

/**
 * Starts the shared MSW server for all Vitest runs.
 */
beforeAll((): void => {
  networkServer.listen({ onUnhandledRequest: 'error' });
});

/**
 * Resets runtime handlers after each test.
 */
afterEach((): void => {
  networkServer.resetHandlers();
});

/**
 * Closes the shared MSW server after all tests complete.
 */
afterAll((): void => {
  networkServer.close();
});
