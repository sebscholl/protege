import { setupServer } from 'msw/node';

/**
 * Shared MSW server instance for all tests.
 */
export const networkServer = setupServer();
