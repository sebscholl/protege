import type { InboundNormalizedMessage } from '@engine/gateway/types';

/**
 * Enumerates persisted message directions used by harness storage.
 */
export type HarnessMessageDirection = 'inbound' | 'outbound' | 'synthetic';

/**
 * Represents one stored harness message record.
 */
export type HarnessStoredMessage = {
  id: string;
  threadId: string;
  direction: HarnessMessageDirection;
  messageId: string;
  inReplyTo?: string;
  sender: string;
  recipients: string[];
  subject: string;
  textBody: string;
  htmlBody?: string;
  receivedAt: string;
  rawMimePath: string;
  metadata: Record<string, unknown>;
};

/**
 * Represents one storage request for persisting inbound gateway messages.
 */
export type StoreInboundMessageRequest = {
  message: InboundNormalizedMessage;
};

/**
 * Represents one storage request for persisting outbound harness responses.
 */
export type StoreOutboundMessageRequest = {
  threadId: string;
  messageId: string;
  inReplyTo: string;
  sender: string;
  recipients: string[];
  subject: string;
  text: string;
  receivedAt: string;
  metadata: Record<string, unknown>;
};

/**
 * Represents one normalized harness input used to build runtime context.
 */
export type HarnessInput = {
  source: 'email' | 'responsibility';
  threadId: string;
  messageId: string;
  sender: string;
  recipients: string[];
  subject: string;
  text: string;
  receivedAt: string;
  metadata: Record<string, unknown>;
};

/**
 * Represents one contextualized history entry used for prompt assembly.
 */
export type HarnessContextHistoryEntry = {
  direction: HarnessMessageDirection;
  sender: string;
  subject: string;
  text: string;
  receivedAt: string;
  messageId: string;
};

/**
 * Represents one persisted tool loop event tied to a thread turn.
 */
export type HarnessThreadToolEvent = {
  id: string;
  threadId: string;
  parentMessageId: string;
  runId: string;
  stepIndex: number;
  eventType: 'tool_call' | 'tool_result';
  toolName: string;
  toolCallId: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

/**
 * Represents the assembled harness context prior to provider invocation.
 */
export type HarnessContext = {
  threadId: string;
  activeMemory: string;
  systemSections?: string[];
  history: HarnessContextHistoryEntry[];
  input: HarnessInput;
};
