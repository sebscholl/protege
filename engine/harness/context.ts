import type { ProtegeDatabase } from '@engine/shared/database';

import type {
  HarnessContext,
  HarnessContextHistoryEntry,
  HarnessInput,
} from '@engine/harness/types';

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { listThreadMessages } from '@engine/harness/storage';

/**
 * Resolves the default active-memory file path for local runtime context.
 */
export function resolveDefaultActiveMemoryPath(): string {
  return join(process.cwd(), 'memory', 'active.md');
}

/**
 * Loads active memory text from disk and returns an empty string when absent.
 */
export function loadActiveMemory(
  args: {
    activeMemoryPath?: string;
  } = {},
): string {
  const activeMemoryPath = args.activeMemoryPath ?? resolveDefaultActiveMemoryPath();
  if (!existsSync(activeMemoryPath)) {
    return '';
  }

  return readFileSync(activeMemoryPath, 'utf8').trim();
}

/**
 * Transforms stored thread messages into harness history entries.
 */
export function buildHistoryEntries(
  args: {
    db: ProtegeDatabase;
    threadId: string;
  },
): HarnessContextHistoryEntry[] {
  const storedMessages = listThreadMessages({
    db: args.db,
    threadId: args.threadId,
  });

  return storedMessages.map((message) => ({
    direction: message.direction,
    sender: message.sender,
    subject: message.subject,
    text: message.textBody,
    receivedAt: message.receivedAt,
    messageId: message.messageId,
  }));
}

/**
 * Estimates token usage with a deterministic character-based approximation.
 */
export function estimateTokens(
  args: {
    value: string;
  },
): number {
  return Math.ceil(args.value.length / 4);
}

/**
 * Truncates history by token budget, preserving newest messages first.
 */
export function truncateHistoryToTokenBudget(
  args: {
    history: HarnessContextHistoryEntry[];
    maxHistoryTokens: number;
  },
): HarnessContextHistoryEntry[] {
  const selected: HarnessContextHistoryEntry[] = [];
  let runningTotal = 0;

  for (let index = args.history.length - 1; index >= 0; index -= 1) {
    const item = args.history[index];
    const cost = estimateTokens({ value: `${item.subject}\n${item.text}` });
    if (runningTotal + cost > args.maxHistoryTokens) {
      continue;
    }

    selected.push(item);
    runningTotal += cost;
  }

  return selected.reverse();
}

/**
 * Builds the harness context object from active memory and temporal thread history.
 */
export function buildHarnessContext(
  args: {
    db: ProtegeDatabase;
    input: HarnessInput;
    activeMemoryPath?: string;
    maxHistoryTokens?: number;
  },
): HarnessContext {
  const activeMemory = loadActiveMemory({
    activeMemoryPath: args.activeMemoryPath,
  });
  const history = buildHistoryEntries({
    db: args.db,
    threadId: args.input.threadId,
  });
  const trimmedHistory = truncateHistoryToTokenBudget({
    history,
    maxHistoryTokens: args.maxHistoryTokens ?? 1200,
  });

  return {
    threadId: args.input.threadId,
    activeMemory,
    history: trimmedHistory,
    input: args.input,
  };
}
