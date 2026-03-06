# Milestone Plan: Context Loading and Management

Status: Proposed  
Scope: Define and implement deterministic context assembly for gateway and scheduler runs.

## Goal

Create one explicit, testable context-loading pipeline that:

1. Loads persona identity/instructions from files (not hidden DB fields).
2. Behaves consistently across inbound email, local chat, and scheduler responsibilities.
3. Preserves Protege's email-native model while preventing context drift.

## External Pattern Summary (Reference Inputs)

Primary sources reviewed:

1. Anthropic Claude Code memory model (`CLAUDE.md` hierarchy + imports).
2. OpenClaw context model (explicit context composition + compaction visibility).
3. OpenHands microagents model (always-on + conditional prompt extensions, context-window awareness).

Reusable patterns for Protege:

1. Layered, file-first instruction sources with explicit precedence.
2. Strict distinction between persisted memory and active model context.
3. Inspectable context composition for operator debugging.
4. Conditional context blocks for invocation type (email thread vs responsibility run).

## Proposed Protege Context Layers (v1)

For each harness invocation, build context in this order:

1. `System layer`: `prompts/system.md`.
2. `Persona layer`: `personas/{persona_id}/PERSONA.md`.
3. `Active memory layer`: `memory/{persona_id}/active.md`.
4. `Invocation layer`:
   1. Inbound email metadata note (from/to/cc/bcc/thread/message ids).
   2. Responsibility execution note when source is scheduler (responsibility id/name/schedule).
5. `Thread history layer`: prior messages for the same thread, trimmed by budget.
6. `Current input layer`: newest inbound/synthetic message text.

Non-goals for this milestone:

1. Relationship/contact context injection (`relationships/`) as first-class runtime input.
2. Vector retrieval.
3. Multi-file persona imports.

## Source-Type Rules

### Existing Email Thread

1. Include all layers.
2. History layer includes same-thread messages up to budget.
3. Current input is latest inbound email body.

### New Local Chat Thread

1. Include all layers.
2. History layer contains only available thread records (usually minimal at thread start).
3. Thread title/subject stays canonical to root message subject.

### Scheduler Responsibility Run

1. Include all layers.
2. Invocation layer includes responsibility metadata.
3. Current input is responsibility prompt snapshot for that run.
4. Thread remains run-scoped as already defined by ADR-0017.

## Token Budget Policy (v1)

Keep deterministic char-based estimation initially, but apply explicit budgets per layer:

1. Reserve headroom for model output/tool loop.
2. Persona layer is always included when present.
3. Active memory is included with cap/truncation.
4. History is newest-first within remaining budget.

Budget tuning and true tokenizer support are follow-up work.

## Configuration Surface (Planned)

Add one dedicated config for context assembly:

1. `configs/context.json`

Minimal v1 surface:

1. `pipelines.thread` with ordered step strings.
2. `pipelines.responsibility` with ordered step strings.
3. Step forms:
   1. `<resolver-name>`
   2. `<resolver-name>(arg1, arg2, ...)`

Notes:

1. All shipped dynamic loaders are referenced as resolver-call entries.
2. Custom dynamic loaders use the same resolver contract and naming.
3. No separate `builtin` step type is introduced.

## Implementation Checklist

## CL1: Context Contract

- [ ] Add a typed context-source contract in harness types.
- [ ] Distinguish invocation source (`email | chat | responsibility`) consistently.
- [ ] Keep provider message build pure/deterministic.

Target files:

1. `engine/harness/types.ts`
2. `engine/harness/context.ts`
3. `engine/harness/runtime.ts`

## CL2: Persona Prompt Source

- [ ] Add `personas/{persona_id}/PERSONA.md` read path helper.
- [ ] Load persona prompt into context assembly.
- [ ] Keep missing file behavior explicit (`empty` + structured log).

Target files:

1. `engine/shared/personas.ts`
2. `engine/harness/context.ts`
3. `engine/harness/runtime.ts`
4. `personas/README.md`

## CL3: Invocation-Specific Notes

- [ ] Normalize source metadata into typed invocation note builders.
- [ ] Ensure scheduler runs include responsibility metadata note.
- [ ] Keep existing routing note behavior and align naming.

Target files:

1. `engine/harness/runtime.ts`
2. `engine/scheduler/runner.ts`
3. `engine/harness/types.ts`

## CL4: Observability and Debuggability

- [ ] Emit context-build summary events (sizes per layer, trimmed counts).
- [ ] Expose context composition in logs without dumping sensitive raw content.

Target files:

1. `engine/harness/runtime.ts`
2. `engine/cli/logs.ts` (if formatting updates needed)

## CL5: Tests

- [ ] Unit tests for layer ordering and inclusion rules.
- [ ] Unit tests for missing `PERSONA.md` behavior.
- [ ] Unit tests for scheduler invocation-layer composition.
- [ ] Integration tests for email-thread and scheduler-run context differences.
- [ ] Regression tests for history trimming staying deterministic.

Target tests:

1. `tests/engine/harness/context.test.ts` (new)
2. `tests/engine/harness/runtime-thread-history.test.ts`
3. `tests/engine/scheduler/runner.test.ts`
4. `tests/e2e/scheduler-reliability.test.ts`

## Exit Criteria

1. Context loading is deterministic and layer-ordered across all invocation types.
2. `PERSONA.md` is part of every run context (when present).
3. Scheduler and gateway contexts share one assembly pipeline.
4. Tests cover layer order, source-specific behavior, and trimming.
5. Docs and ADRs reflect final behavior.
