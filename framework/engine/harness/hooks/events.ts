/**
 * Enumerates all v1 runtime log events that are eligible for hook dispatch.
 */
export const HOOK_EVENT = {
  ChatRuntimeActionCompleted: 'chat.runtime_action.completed',
  ChatSendFailed: 'chat.send.failed',
  MemoryActiveUpdated: 'memory.active.updated',
  MemoryThreadUpdated: 'memory.thread.updated',
  GatewayAlertFailed: 'gateway.alert.failed',
  GatewayAlertSent: 'gateway.alert.sent',
  GatewayAlertSkippedMissingAdminContact: 'gateway.alert.skipped_missing_admin_contact',
  GatewayAlertSkippedMissingPersona: 'gateway.alert.skipped_missing_persona',
  GatewayError: 'gateway.error',
  GatewayInboundEnqueued: 'gateway.inbound.enqueued',
  GatewayInboundParsed: 'gateway.inbound.parsed',
  GatewayInboundReceived: 'gateway.inbound.received',
  GatewayInboundServerStarted: 'gateway.inbound.server_started',
  GatewayOutboundQueuedViaRelay: 'gateway.outbound.queued_via_relay',
  GatewayOutboundSentViaRelay: 'gateway.outbound.sent_via_relay',
  GatewayOutboundRelayDeliverySignalTimeout: 'gateway.outbound.relay_delivery_signal_timeout',
  GatewayOutboundSending: 'gateway.outbound.sending',
  GatewayOutboundSent: 'gateway.outbound.sent',
  GatewayPersonaEmailDomainReconciled: 'gateway.persona.email_domain_reconciled',
  GatewayRelayAuthenticated: 'gateway.relay.authenticated',
  GatewayRelayClientStarting: 'gateway.relay.client_starting',
  GatewayRelayClientsStarted: 'gateway.relay.clients_started',
  GatewayRelayControlMessage: 'gateway.relay.control_message',
  GatewayRelayDisconnected: 'gateway.relay.disconnected',
  GatewayRelayFrameInvalid: 'gateway.relay.frame_invalid',
  GatewayRelayIngestFailed: 'gateway.relay.ingest_failed',
  GatewayRelayIngestUninitialized: 'gateway.relay.ingest_uninitialized',
  GatewayRuntimeActionCompleted: 'gateway.runtime_action.completed',
  GatewayRuntimeActionInvoking: 'gateway.runtime_action.invoking',
  GatewaySchedulerStartFailed: 'gateway.scheduler.start_failed',
  HarnessInboundPersisted: 'harness.inbound.persisted',
  HarnessInferenceCompleted: 'harness.inference.completed',
  HarnessInferenceStarted: 'harness.inference.started',
  HarnessToolCallCompleted: 'harness.tool.call.completed',
  HarnessToolCallFailed: 'harness.tool.call.failed',
  HarnessToolCallStarted: 'harness.tool.call.started',
  HarnessToolCallsReceived: 'harness.tool.calls.received',
  SchedulerAlertSkippedMissingAdminContact: 'scheduler.alert.skipped_missing_admin_contact',
  SchedulerCronEnqueued: 'scheduler.cron.enqueued',
  SchedulerCronInvalidSchedule: 'scheduler.cron.invalid_schedule',
  SchedulerCronSkippedOverlap: 'scheduler.cron.skipped_overlap',
  SchedulerCyclePersonaFailed: 'scheduler.cycle.persona_failed',
  SchedulerCycleThrottled: 'scheduler.cycle.throttled',
  SchedulerRecoveryInterruptedRunsFinalized: 'scheduler.recovery.interrupted_runs_finalized',
  SchedulerRunClaimed: 'scheduler.run.claimed',
  SchedulerRunCompleted: 'scheduler.run.completed',
  SchedulerRunFailed: 'scheduler.run.failed',
  SchedulerRunStarted: 'scheduler.run.started',
  SchedulerStopped: 'scheduler.stopped',
  SchedulerSyncCompleted: 'scheduler.sync.completed',
} as const;

/**
 * Represents one supported hook event name.
 */
export type HookEventName = typeof HOOK_EVENT[keyof typeof HOOK_EVENT];

/**
 * Represents one typed base payload emitted for hooks.
 */
export type HookEventPayloadBase<
  TEvent extends HookEventName,
> = {
  level: 'info' | 'error';
  scope: string;
  event: TEvent;
  timestamp: string;
} & Record<string, unknown>;

/**
 * Represents typed payload mapping for each supported hook event.
 */
export type HookEventPayloadByName = {
  [HOOK_EVENT.ChatRuntimeActionCompleted]: HookEventPayloadBase<typeof HOOK_EVENT.ChatRuntimeActionCompleted>;
  [HOOK_EVENT.ChatSendFailed]: HookEventPayloadBase<typeof HOOK_EVENT.ChatSendFailed>;
  [HOOK_EVENT.MemoryActiveUpdated]: HookEventPayloadBase<typeof HOOK_EVENT.MemoryActiveUpdated>;
  [HOOK_EVENT.MemoryThreadUpdated]: HookEventPayloadBase<typeof HOOK_EVENT.MemoryThreadUpdated>;
  [HOOK_EVENT.GatewayAlertFailed]: HookEventPayloadBase<typeof HOOK_EVENT.GatewayAlertFailed>;
  [HOOK_EVENT.GatewayAlertSent]: HookEventPayloadBase<typeof HOOK_EVENT.GatewayAlertSent>;
  [HOOK_EVENT.GatewayAlertSkippedMissingAdminContact]: HookEventPayloadBase<typeof HOOK_EVENT.GatewayAlertSkippedMissingAdminContact>;
  [HOOK_EVENT.GatewayAlertSkippedMissingPersona]: HookEventPayloadBase<typeof HOOK_EVENT.GatewayAlertSkippedMissingPersona>;
  [HOOK_EVENT.GatewayError]: HookEventPayloadBase<typeof HOOK_EVENT.GatewayError>;
  [HOOK_EVENT.GatewayInboundEnqueued]: HookEventPayloadBase<typeof HOOK_EVENT.GatewayInboundEnqueued>;
  [HOOK_EVENT.GatewayInboundParsed]: HookEventPayloadBase<typeof HOOK_EVENT.GatewayInboundParsed>;
  [HOOK_EVENT.GatewayInboundReceived]: HookEventPayloadBase<typeof HOOK_EVENT.GatewayInboundReceived>;
  [HOOK_EVENT.GatewayInboundServerStarted]: HookEventPayloadBase<typeof HOOK_EVENT.GatewayInboundServerStarted>;
  [HOOK_EVENT.GatewayOutboundQueuedViaRelay]: HookEventPayloadBase<typeof HOOK_EVENT.GatewayOutboundQueuedViaRelay>;
  [HOOK_EVENT.GatewayOutboundSentViaRelay]: HookEventPayloadBase<typeof HOOK_EVENT.GatewayOutboundSentViaRelay>;
  [HOOK_EVENT.GatewayOutboundRelayDeliverySignalTimeout]: HookEventPayloadBase<typeof HOOK_EVENT.GatewayOutboundRelayDeliverySignalTimeout>;
  [HOOK_EVENT.GatewayOutboundSending]: HookEventPayloadBase<typeof HOOK_EVENT.GatewayOutboundSending>;
  [HOOK_EVENT.GatewayOutboundSent]: HookEventPayloadBase<typeof HOOK_EVENT.GatewayOutboundSent>;
  [HOOK_EVENT.GatewayPersonaEmailDomainReconciled]: HookEventPayloadBase<typeof HOOK_EVENT.GatewayPersonaEmailDomainReconciled>;
  [HOOK_EVENT.GatewayRelayAuthenticated]: HookEventPayloadBase<typeof HOOK_EVENT.GatewayRelayAuthenticated>;
  [HOOK_EVENT.GatewayRelayClientStarting]: HookEventPayloadBase<typeof HOOK_EVENT.GatewayRelayClientStarting>;
  [HOOK_EVENT.GatewayRelayClientsStarted]: HookEventPayloadBase<typeof HOOK_EVENT.GatewayRelayClientsStarted>;
  [HOOK_EVENT.GatewayRelayControlMessage]: HookEventPayloadBase<typeof HOOK_EVENT.GatewayRelayControlMessage>;
  [HOOK_EVENT.GatewayRelayDisconnected]: HookEventPayloadBase<typeof HOOK_EVENT.GatewayRelayDisconnected>;
  [HOOK_EVENT.GatewayRelayFrameInvalid]: HookEventPayloadBase<typeof HOOK_EVENT.GatewayRelayFrameInvalid>;
  [HOOK_EVENT.GatewayRelayIngestFailed]: HookEventPayloadBase<typeof HOOK_EVENT.GatewayRelayIngestFailed>;
  [HOOK_EVENT.GatewayRelayIngestUninitialized]: HookEventPayloadBase<typeof HOOK_EVENT.GatewayRelayIngestUninitialized>;
  [HOOK_EVENT.GatewayRuntimeActionCompleted]: HookEventPayloadBase<typeof HOOK_EVENT.GatewayRuntimeActionCompleted>;
  [HOOK_EVENT.GatewayRuntimeActionInvoking]: HookEventPayloadBase<typeof HOOK_EVENT.GatewayRuntimeActionInvoking>;
  [HOOK_EVENT.GatewaySchedulerStartFailed]: HookEventPayloadBase<typeof HOOK_EVENT.GatewaySchedulerStartFailed>;
  [HOOK_EVENT.HarnessInboundPersisted]: HookEventPayloadBase<typeof HOOK_EVENT.HarnessInboundPersisted>;
  [HOOK_EVENT.HarnessInferenceCompleted]: HookEventPayloadBase<typeof HOOK_EVENT.HarnessInferenceCompleted>;
  [HOOK_EVENT.HarnessInferenceStarted]: HookEventPayloadBase<typeof HOOK_EVENT.HarnessInferenceStarted>;
  [HOOK_EVENT.HarnessToolCallCompleted]: HookEventPayloadBase<typeof HOOK_EVENT.HarnessToolCallCompleted>;
  [HOOK_EVENT.HarnessToolCallFailed]: HookEventPayloadBase<typeof HOOK_EVENT.HarnessToolCallFailed>;
  [HOOK_EVENT.HarnessToolCallStarted]: HookEventPayloadBase<typeof HOOK_EVENT.HarnessToolCallStarted>;
  [HOOK_EVENT.HarnessToolCallsReceived]: HookEventPayloadBase<typeof HOOK_EVENT.HarnessToolCallsReceived>;
  [HOOK_EVENT.SchedulerAlertSkippedMissingAdminContact]: HookEventPayloadBase<typeof HOOK_EVENT.SchedulerAlertSkippedMissingAdminContact>;
  [HOOK_EVENT.SchedulerCronEnqueued]: HookEventPayloadBase<typeof HOOK_EVENT.SchedulerCronEnqueued>;
  [HOOK_EVENT.SchedulerCronInvalidSchedule]: HookEventPayloadBase<typeof HOOK_EVENT.SchedulerCronInvalidSchedule>;
  [HOOK_EVENT.SchedulerCronSkippedOverlap]: HookEventPayloadBase<typeof HOOK_EVENT.SchedulerCronSkippedOverlap>;
  [HOOK_EVENT.SchedulerCyclePersonaFailed]: HookEventPayloadBase<typeof HOOK_EVENT.SchedulerCyclePersonaFailed>;
  [HOOK_EVENT.SchedulerCycleThrottled]: HookEventPayloadBase<typeof HOOK_EVENT.SchedulerCycleThrottled>;
  [HOOK_EVENT.SchedulerRecoveryInterruptedRunsFinalized]: HookEventPayloadBase<typeof HOOK_EVENT.SchedulerRecoveryInterruptedRunsFinalized>;
  [HOOK_EVENT.SchedulerRunClaimed]: HookEventPayloadBase<typeof HOOK_EVENT.SchedulerRunClaimed>;
  [HOOK_EVENT.SchedulerRunCompleted]: HookEventPayloadBase<typeof HOOK_EVENT.SchedulerRunCompleted>;
  [HOOK_EVENT.SchedulerRunFailed]: HookEventPayloadBase<typeof HOOK_EVENT.SchedulerRunFailed>;
  [HOOK_EVENT.SchedulerRunStarted]: HookEventPayloadBase<typeof HOOK_EVENT.SchedulerRunStarted>;
  [HOOK_EVENT.SchedulerStopped]: HookEventPayloadBase<typeof HOOK_EVENT.SchedulerStopped>;
  [HOOK_EVENT.SchedulerSyncCompleted]: HookEventPayloadBase<typeof HOOK_EVENT.SchedulerSyncCompleted>;
};

/**
 * Represents one hook callback signature bound to typed events and payloads.
 */
export type HarnessHookOnEvent = <
  TEvent extends HookEventName,
>(
  event: TEvent,
  payload: HookEventPayloadByName[TEvent],
  config: Record<string, unknown>,
) => Promise<HarnessHookResult> | HarnessHookResult;

/**
 * Represents one hook-emitted event payload used for chained hook workflows.
 */
export type HarnessHookEmittedEvent = {
  event: HookEventName;
  payload: HookEventPayloadByName[HookEventName];
};

/**
 * Represents one optional hook callback result with chained event emissions.
 */
export type HarnessHookResult = void | {
  emit?: HarnessHookEmittedEvent[];
};

/**
 * Returns true when one string value is a known hook event name.
 */
export function isHookEventName(
  value: string,
): value is HookEventName {
  return Object.values(HOOK_EVENT).includes(value as HookEventName);
}
