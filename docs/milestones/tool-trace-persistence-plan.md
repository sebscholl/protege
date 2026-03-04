# Milestone Plan: Tool Trace Persistence in Thread Context

Status: Proposed  
Scope: Persist tool calls/results as thread events and load them in context for multi-turn continuity.

## Goal

Make tool execution part of durable thread memory so later generations can reconstruct prior actions and outcomes without relying on transient in-memory loop state.

## Outcome

For each inbound turn:

1. Tool calls/results are persisted with deterministic sequence.
2. Tool traces are tied to the triggering inbound message.
3. Context assembly can include prior tool traces (budgeted/compact).

## Event Model (v1)

Persist synthetic thread events with:

1. `thread_id`
2. `parent_message_id` (inbound message id triggering run)
3. `run_id`
4. `step_index` (monotonic per run)
5. `event_type` (`tool_call` | `tool_result`)
6. `tool_name`
7. `tool_call_id`
8. `payload_json` (bounded)
9. `created_at`

## Causal Ordering Rules

1. `parent_message_id` groups all events for one inbound turn.
2. `step_index` determines exact causal order for the run.
3. Timestamps are secondary and never the sole ordering key.

## Data Model Strategy

Prefer additive schema with a dedicated table:

1. `thread_tool_events`

Rationale:

1. avoids overloading existing `messages` table semantics
2. simpler query patterns for grouped tool events
3. easier payload-size and retention policy control

Alternative (not chosen for v1):

1. represent tool events as `messages.direction='synthetic'` rows

## Context Loading Integration

When building thread context:

1. Load recent message history.
2. Load tool events for those parent inbound messages.
3. Materialize compact, ordered tool traces into context blocks:
   - call intent
   - result summary / failure
4. Apply token budget cap to tool trace layer.

## Step-by-Step Run Story

1. Inbound message persisted (`message_id` known).
2. Harness run starts with `run_id`, `step_index=0`.
3. For each tool call:
   1. persist `tool_call` event (`step_index++`)
   2. execute tool
   3. persist `tool_result` event (`step_index++`)
4. Persist outbound/final response.
5. Next turn loads prior tool traces via thread + parent message linkage.

## Implementation Checklist

## TP1: Schema + Storage

- [ ] Add migration creating `thread_tool_events`.
- [ ] Add indexes:
  1. `(thread_id, parent_message_id, run_id, step_index)`
  2. `(thread_id, created_at)`
- [ ] Add storage helpers:
  1. `storeThreadToolEvent`
  2. `listThreadToolEventsByParents`

Target files:

1. `engine/shared/migrations/` (new migration)
2. `engine/harness/storage.ts`
3. `engine/harness/types.ts`

## TP2: Harness Runtime Persistence

- [ ] Generate/propagate `run_id` for each inbound harness run.
- [ ] Persist tool call and result events during provider tool loop.
- [ ] Maintain monotonic `step_index` per run.
- [ ] Persist failure payloads in `tool_result` for error cases.

Target files:

1. `engine/harness/runtime.ts`
2. `engine/harness/types.ts`

## TP3: Context Builder Integration

- [ ] Load tool events alongside thread history.
- [ ] Convert tool events into compact context layer text.
- [ ] Respect token budget and truncation for tool traces.

Target files:

1. `engine/harness/context.ts`
2. `engine/harness/runtime.ts`

## TP4: Rendering + Diagnostics

- [ ] Expose tool traces in chat thread rendering (readable compact blocks).
- [ ] Add logs for tool-event persistence failures (non-fatal where appropriate).

Target files:

1. `engine/cli/chat/` (where thread renderers live)
2. `engine/harness/runtime.ts`

## TP5: Tests

- [ ] Unit tests: storage insert/list ordering by `step_index`.
- [ ] Unit tests: runtime persists expected event sequence per run.
- [ ] Unit tests: context assembly includes ordered tool traces.
- [ ] Regression tests: failed tool calls still persist trace rows.
- [ ] E2E test: multi-turn thread uses prior tool traces for continuity.

Target tests:

1. `tests/engine/harness/storage.test.ts`
2. `tests/engine/harness/runtime*.test.ts`
3. `tests/engine/harness/context.test.ts` (new or updated)
4. `tests/e2e/*` continuity coverage

## Non-Goals

1. Persist provider hidden reasoning tokens.
2. Full chain-of-thought capture.
3. Unlimited raw payload storage without truncation.

## Exit Criteria

1. Tool traces persist deterministically and are queryable by thread + inbound parent.
2. Context assembly includes prior tool traces with stable order.
3. Multi-turn runs show improved continuity after tool-heavy turns.
4. Tests cover schema, runtime persistence, context loading, and failure paths.
