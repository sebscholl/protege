import type { HarnessHookEntry } from '@engine/harness/hook-registry';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createHookDispatcher } from '@engine/harness/hook-registry';

let dispatchReturnedImmediately = false;
let slowHookCompleted = false;
let failureHookErrorMessage = '';
let wildcardHookObserved = false;
let exactHookObserved = false;
let manifestOrderTrace = '';

/**
 * Returns one hook entry that records execution order in a shared trace array.
 */
function createTracingHook(
  args: {
    name: string;
    trace: string[];
    events?: string[];
  },
): HarnessHookEntry {
  return {
    name: args.name,
    events: args.events ?? ['*'],
    config: {},
    onEvent: async (): Promise<void> => {
      args.trace.push(args.name);
    },
  };
}

beforeAll(async (): Promise<void> => {
  const orderTrace: string[] = [];
  const hooks: HarnessHookEntry[] = [
    createTracingHook({
      name: 'first',
      trace: orderTrace,
      events: ['harness.inference.completed'],
    }),
    {
      name: 'failing',
      events: ['harness.inference.completed'],
      config: {},
      onEvent: async (): Promise<void> => {
        throw new Error('intentional hook failure');
      },
    },
    createTracingHook({
      name: 'third',
      trace: orderTrace,
      events: ['harness.inference.completed'],
    }),
    {
      name: 'wildcard',
      events: ['*'],
      config: {},
      onEvent: async (): Promise<void> => {
        wildcardHookObserved = true;
      },
    },
    {
      name: 'exact',
      events: ['harness.inference.completed'],
      config: {},
      onEvent: async (): Promise<void> => {
        exactHookObserved = true;
      },
    },
    {
      name: 'slow',
      events: ['harness.inference.completed'],
      config: {},
      onEvent: async (): Promise<void> => {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 80);
        });
        slowHookCompleted = true;
      },
    },
  ];
  const dispatcher = createHookDispatcher({
    hooks,
    onHookError: (
      _hookName,
      _event,
      error,
    ): void => {
      failureHookErrorMessage = error.message;
    },
  });

  const startedAtMs = Date.now();
  dispatcher.dispatch('harness.inference.completed', {
    level: 'info',
    scope: 'harness',
    event: 'harness.inference.completed',
    timestamp: new Date().toISOString(),
    correlationId: 'dispatch-case-1',
  });
  dispatchReturnedImmediately = Date.now() - startedAtMs < 40;
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 120);
  });
  manifestOrderTrace = orderTrace.join(',');
});

afterAll((): void => {
  dispatchReturnedImmediately = false;
  slowHookCompleted = false;
  failureHookErrorMessage = '';
  wildcardHookObserved = false;
  exactHookObserved = false;
  manifestOrderTrace = '';
});

describe('harness hook dispatch behavior', () => {
  it('returns immediately without waiting for async hook completion', () => {
    expect(dispatchReturnedImmediately).toBe(true);
  });

  it('executes slow hooks asynchronously after dispatch returns', () => {
    expect(slowHookCompleted).toBe(true);
  });

  it('isolates hook failures and forwards error to callback', () => {
    expect(failureHookErrorMessage).toBe('intentional hook failure');
  });

  it('preserves manifest order for subscribed hook invocation', () => {
    expect(manifestOrderTrace).toBe('first,third');
  });

  it('dispatches wildcard subscriptions for matching events', () => {
    expect(wildcardHookObserved).toBe(true);
  });

  it('dispatches exact subscriptions for matching events', () => {
    expect(exactHookObserved).toBe(true);
  });
});

