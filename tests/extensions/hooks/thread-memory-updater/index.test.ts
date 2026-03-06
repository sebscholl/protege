import type { ThreadMemoryState } from '@engine/harness/memory/storage';
import type { HarnessStoredMessage, HarnessThreadToolEvent } from '@engine/harness/types';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  buildThreadDelta,
  buildThreadSynthesisInput,
  createThreadMemoryUpdaterHook,
  resolveThreadMemoryUpdaterConfig,
} from '@extensions/hooks/thread-memory-updater/index';

let ignoresUnrelatedEvents = false;
let emittedThreadUpdatedEvent = false;
let persistedSummaryText = '';
let synthesizeInputContainsPrevious = false;
let deltaCountRespectsLimit = false;

beforeAll(async (): Promise<void> => {
  const messages: HarnessStoredMessage[] = [
    {
      id: '1',
      threadId: 'thread-a',
      direction: 'inbound',
      messageId: '<m1>',
      sender: 'sender@example.com',
      recipients: ['persona@example.com'],
      subject: 'hello',
      textBody: 'first',
      receivedAt: '2026-03-06T00:00:00.000Z',
      rawMimePath: 'x',
      metadata: {},
    },
    {
      id: '2',
      threadId: 'thread-a',
      direction: 'outbound',
      messageId: '<m2>',
      sender: 'persona@example.com',
      recipients: ['sender@example.com'],
      subject: 're: hello',
      textBody: 'second',
      receivedAt: '2026-03-06T00:01:00.000Z',
      rawMimePath: 'x',
      metadata: {},
    },
  ];
  const events: HarnessThreadToolEvent[] = [
    {
      id: 'e1',
      threadId: 'thread-a',
      parentMessageId: '<m1>',
      runId: 'r1',
      stepIndex: 1,
      eventType: 'tool_result',
      toolName: 'read-file',
      toolCallId: 'call_1',
      payload: { ok: true },
      createdAt: '2026-03-06T00:00:30.000Z',
    },
  ];
  const previousState: ThreadMemoryState = {
    threadId: 'thread-a',
    personaId: 'persona-a',
    summaryText: 'previous summary',
    sourceMessageId: '<m1>',
    sourceReceivedAt: '2026-03-06T00:00:00.000Z',
    sourceToolEventAt: '2026-03-06T00:00:10.000Z',
    updatedAt: '2026-03-06T00:00:20.000Z',
  };

  const noopResult = await createThreadMemoryUpdaterHook({
    openPersonaDatabase: () => ({ close: (): void => undefined } as never),
    readState: () => previousState,
    readMessages: () => messages,
    readToolEvents: () => events,
    writeState: (): void => undefined,
    synthesize: async () => ({
      provider: 'openai',
      model: 'gpt-4.1',
      outputText: 'x',
    }),
    nowIso: () => '2026-03-06T00:03:00.000Z',
  })('harness.inference.started', {
    level: 'info',
    scope: 'harness',
    event: 'harness.inference.started',
    timestamp: '2026-03-06T00:02:00.000Z',
    personaId: 'persona-a',
    threadId: 'thread-a',
  } as never, {});
  ignoresUnrelatedEvents = noopResult === undefined;

  const hook = createThreadMemoryUpdaterHook({
    openPersonaDatabase: () => ({ close: (): void => undefined } as never),
    readState: () => previousState,
    readMessages: () => messages,
    readToolEvents: () => events,
    writeState: (
      _db,
      state,
    ): void => {
      persistedSummaryText = state.summaryText;
    },
    synthesize: async (args) => {
      synthesizeInputContainsPrevious = args.inputText.includes('previous summary');
      return {
        provider: 'openai',
        model: 'gpt-4.1',
        outputText: 'new summary',
      };
    },
    nowIso: () => '2026-03-06T00:03:00.000Z',
  });

  const result = await hook('harness.inference.completed', {
    level: 'info',
    scope: 'harness',
    event: 'harness.inference.completed',
    timestamp: '2026-03-06T00:02:00.000Z',
    personaId: 'persona-a',
    threadId: 'thread-a',
    messageId: '<m1>',
    responseMessageId: '<m2>',
  }, {
    max_delta_items: 5,
  });
  emittedThreadUpdatedEvent = result?.emit?.[0]?.event === 'memory.thread.updated';

  const delta = buildThreadDelta({
    messages,
    events,
    maxDeltaItems: 1,
  });
  deltaCountRespectsLimit = delta.items.length === 1;
});

describe('thread-memory-updater hook', () => {
  it('ignores unrelated hook events', () => {
    expect(ignoresUnrelatedEvents).toBe(true);
  });

  it('emits memory.thread.updated after synthesis succeeds', () => {
    expect(emittedThreadUpdatedEvent).toBe(true);
  });

  it('persists synthesized thread summary text through dependency writer', () => {
    expect(persistedSummaryText).toBe('new summary');
  });

  it('includes previous summary content in synthesis input payload', () => {
    expect(synthesizeInputContainsPrevious).toBe(true);
  });

  it('limits synthesized delta timeline items by configured max count', () => {
    expect(deltaCountRespectsLimit).toBe(true);
  });

  it('parses thread-memory updater config defaults and overrides', () => {
    expect(resolveThreadMemoryUpdaterConfig({ config: { max_delta_items: 9 } }).maxDeltaItems).toBe(9);
  });

  it('formats synthesis payload with prior summary and numbered delta rows', () => {
    expect(buildThreadSynthesisInput({ previousSummary: 'x', deltaItems: [] }).includes('Previous Thread Memory Summary')).toBe(true);
  });
});
