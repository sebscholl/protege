/**
 * Exposes the supported extension-author surface for Protege runtime integrations.
 *
 * Use `import { ... } from '@protege-pack/toolkit'` from tools/hooks/resolvers/providers.
 */
export {
  HOOK_EVENT,
  isHookEventName,
} from '@engine/harness/hooks/events';
export type {
  HarnessHookEmittedEvent,
  HarnessHookOnEvent,
  HarnessHookResult,
  HookEventName,
  HookEventPayloadByName,
} from '@engine/harness/hooks/events';

export type {
  HarnessToolDefinition,
  HarnessToolExecutionContext,
  HarnessToolRegistry,
} from '@engine/harness/tools/contract';

export type {
  HarnessResolverDefinition,
  HarnessResolverEntry,
  ResolverInvocation,
  ResolverOutput,
} from '@engine/harness/resolvers/types';

export type {
  HarnessProviderAdapter,
  HarnessProviderCapabilities,
  HarnessProviderCapability,
  HarnessProviderErrorCode,
  HarnessProviderGenerateRequest,
  HarnessProviderGenerateResponse,
  HarnessProviderId,
  HarnessProviderMessage,
  HarnessProviderMessagePart,
  HarnessProviderModelId,
  HarnessProviderRole,
  HarnessProviderTool,
  HarnessProviderToolCall,
  HarnessProviderUsage,
} from '@engine/harness/providers/contract';
export {
  HarnessProviderError,
  assertProviderCapability,
  isSupportedProviderId,
  parseProviderModelId,
} from '@engine/harness/providers/contract';

export type {
  HarnessContext,
  HarnessContextHistoryEntry,
  HarnessInput,
  HarnessStoredMessage,
  HarnessThreadToolEvent,
} from '@engine/harness/types';

export {
  buildHistoryEntries,
  truncateHistoryToTokenBudget,
} from '@engine/harness/context/history';

export {
  listThreadMessages,
  listThreadToolEventsByThread,
} from '@engine/harness/storage';

export type {
  PersonaMemorySynthesisState,
  ThreadMemoryState,
} from '@engine/harness/memory/storage';
export {
  clearPersonaMemoryDirty,
  listThreadMemoryStatesByPersona,
  markPersonaMemoryDirty,
  readPersonaMemorySynthesisState,
  readThreadMemoryState,
  setPersonaMemoryDirtyFailure,
  upsertThreadMemoryState,
} from '@engine/harness/memory/storage';

export type {
  SynthesizeMemoryTextArgs,
  SynthesizeMemoryTextResult,
} from '@engine/harness/memory/synthesis';
export {
  synthesizeMemoryText,
} from '@engine/harness/memory/synthesis';

export {
  resolveMigrationsDirPath,
} from '@engine/harness/runtime';

export type {
  ProtegeDatabase,
} from '@engine/shared/database';
export {
  initializeDatabase,
} from '@engine/shared/database';

export {
  resolvePersonaMemoryPaths,
} from '@engine/shared/personas';

export {
  isValidEmailAddress,
} from '@engine/shared/email';
