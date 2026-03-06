import type { PersonaMemorySynthesisState, ThreadMemoryState } from '@engine/harness/memory/storage';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  buildActiveMemorySynthesisInput,
  createActiveMemoryUpdaterHook,
  isDebounceElapsed,
  resolveActiveMemoryUpdaterConfig,
} from '@extensions/hooks/active-memory-updater/index';

let ignoresUnrelatedEvents = false;
let marksDirtyBeforeSynthesis = false;
let wroteActiveMemoryText = '';
let emittedActiveUpdatedEvent = false;
let debouncePreventsImmediateSynthesis = false;
let marksFailureOnSynthesisError = false;

beforeAll(async (): Promise<void> => {
  const threadStates: ThreadMemoryState[] = [
    {
      threadId: 'thread-a',
      personaId: 'persona-a',
      summaryText: 'summary-a',
      updatedAt: '2026-03-06T00:03:00.000Z',
    },
  ];
  const dirtyState: PersonaMemorySynthesisState = {
    personaId: 'persona-a',
    dirty: true,
    lastSynthesizedAt: undefined,
    updatedAt: '2026-03-06T00:03:00.000Z',
  };

  const noopResult = await createActiveMemoryUpdaterHook({
    openPersonaDatabase: () => ({ close: (): void => undefined } as never),
    markDirty: (): void => undefined,
    readState: () => dirtyState,
    listThreadStates: () => threadStates,
    readActiveMemory: () => '',
    writeActiveMemory: (): void => undefined,
    clearDirty: (): void => undefined,
    markFailure: (): void => undefined,
    synthesize: async () => ({
      provider: 'openai',
      model: 'gpt-4.1',
      outputText: 'x',
    }),
    nowIso: () => '2026-03-06T00:06:00.000Z',
  })('harness.inference.completed', {
    level: 'info',
    scope: 'memory',
    event: 'harness.inference.completed',
    timestamp: '2026-03-06T00:04:00.000Z',
  } as never, {});
  ignoresUnrelatedEvents = noopResult === undefined;

  const hook = createActiveMemoryUpdaterHook({
    openPersonaDatabase: () => ({ close: (): void => undefined } as never),
    markDirty: (): void => {
      marksDirtyBeforeSynthesis = true;
    },
    readState: () => dirtyState,
    listThreadStates: () => threadStates,
    readActiveMemory: () => 'old active memory',
    writeActiveMemory: (
      _path,
      text,
    ): void => {
      wroteActiveMemoryText = text;
    },
    clearDirty: (): void => undefined,
    markFailure: (): void => undefined,
    synthesize: async () => ({
      provider: 'openai',
      model: 'gpt-4.1',
      outputText: 'new active memory',
    }),
    nowIso: () => '2026-03-06T00:06:00.000Z',
  });

  const result = await hook('memory.thread.updated', {
    level: 'info',
    scope: 'memory',
    event: 'memory.thread.updated',
    timestamp: '2026-03-06T00:04:00.000Z',
    personaId: 'persona-a',
    threadId: 'thread-a',
  }, {
    debounce_ms: 0,
  });
  emittedActiveUpdatedEvent = result?.emit?.[0]?.event === 'memory.active.updated';

  debouncePreventsImmediateSynthesis = isDebounceElapsed({
    state: {
      lastSynthesizedAt: '2026-03-06T00:06:00.000Z',
    },
    debounceMs: 5000,
    nowMs: Date.parse('2026-03-06T00:06:01.000Z'),
  }) === false;

  await createActiveMemoryUpdaterHook({
    openPersonaDatabase: () => ({ close: (): void => undefined } as never),
    markDirty: (): void => undefined,
    readState: () => dirtyState,
    listThreadStates: () => threadStates,
    readActiveMemory: () => 'active',
    writeActiveMemory: (): void => undefined,
    clearDirty: (): void => undefined,
    markFailure: (): void => {
      marksFailureOnSynthesisError = true;
    },
    synthesize: async () => {
      throw new Error('synthesis failed');
    },
    nowIso: () => '2026-03-06T00:06:00.000Z',
  })('memory.thread.updated', {
    level: 'info',
    scope: 'memory',
    event: 'memory.thread.updated',
    timestamp: '2026-03-06T00:04:00.000Z',
    personaId: 'persona-a',
    threadId: 'thread-a',
  }, {
    debounce_ms: 0,
  }).catch(() => undefined);
});

describe('active-memory-updater hook', () => {
  it('ignores unrelated hook events', () => {
    expect(ignoresUnrelatedEvents).toBe(true);
  });

  it('marks persona active-memory state dirty before synthesis', () => {
    expect(marksDirtyBeforeSynthesis).toBe(true);
  });

  it('writes synthesized active memory content through dependency writer', () => {
    expect(wroteActiveMemoryText).toBe('new active memory');
  });

  it('emits memory.active.updated after active-memory synthesis', () => {
    expect(emittedActiveUpdatedEvent).toBe(true);
  });

  it('respects debounce window when recent synthesis already ran', () => {
    expect(debouncePreventsImmediateSynthesis).toBe(true);
  });

  it('marks dirty failure state when active-memory synthesis throws', () => {
    expect(marksFailureOnSynthesisError).toBe(true);
  });

  it('parses active-memory updater config defaults and overrides', () => {
    expect(resolveActiveMemoryUpdaterConfig({ config: { max_recent_threads: 8 } }).maxRecentThreads).toBe(8);
  });

  it('formats active-memory synthesis input with thread-state section', () => {
    expect(buildActiveMemorySynthesisInput({ activeMemoryText: '', threadStates: [] }).includes('Recent Thread Memory States')).toBe(true);
  });
});
