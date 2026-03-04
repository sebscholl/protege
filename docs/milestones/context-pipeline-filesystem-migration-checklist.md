# Milestone Checklist: Harness Context Pipeline and Filesystem Migration

Status: In Progress  
Scope: Reorganize harness modules and implement resolver-driven context pipeline with extension registration.

## Decision Anchor

1. `docs/adr/0036-harness-context-pipeline-and-resolver-extension-boundary-v1.md`

## Exit Criteria

1. Harness context loading flows through one pipeline runner.
2. Pipeline is configured by `config/context.json` (`file:` + `resolver:` only).
3. Resolver implementations are loaded from `extensions/resolvers/*` via manifest.
4. Gateway/chat/scheduler harness paths use the same invocation-based context call.
5. Existing behavior remains parity-safe with tests.

## CP1: Filesystem and Module Topology

- [x] Create harness subdirectories:
  1. `engine/harness/context/`
  2. `engine/harness/tools/`
  3. `engine/harness/hooks/`
  4. `engine/harness/resolvers/`
- [x] Add/refresh README guidance for new subdirectories.
- [x] Add compatibility re-export shims where needed during migration.

## CP2: Resolver Manifest Support

- [x] Extend `extensions/extensions.json` schema with `resolvers`.
- [x] Implement resolver manifest normalization/validation.
- [x] Implement resolver registry loader (`extensions/resolvers/*`).
- [x] Keep tools/hooks behavior unchanged.

## CP3: Context Config Contract

- [x] Add `config/context.json` default scaffold.
- [x] Add parser/validator for ordered pipeline steps.
- [x] Validate supported step forms:
  1. `file:<path>`
  2. `resolver:<name>`

## CP4: Invocation Contract

- [x] Introduce resolver invocation contract with top-level:
  1. `type`
  2. `context`
- [x] Implement thread invocation payload.
- [x] Implement responsibility invocation payload.

## CP5: Pipeline Runner

- [x] Implement one pipeline runner that executes configured steps in order.
- [x] Implement file-step loader with placeholder expansion.
- [x] Implement resolver-step execution via resolver registry.
- [x] Add centralized budget enforcement and trimming hooks.

## CP6: Entry Point Integration

- [x] Replace direct context assembly in harness runtime with pipeline call.
- [ ] Integrate through one path for:
  1. gateway inbound runs
  2. chat runs
  3. scheduler responsibility runs
- [x] Preserve tool trace continuity layer behavior.

## CP7: Tests (Tests-First Slices)

- [x] Unit tests for manifest resolver normalization.
- [x] Unit tests for context step parsing/validation.
- [x] Unit tests for resolver invocation contract.
- [x] Unit tests for pipeline execution ordering.
- [ ] Integration tests for thread vs responsibility profile behavior.
- [x] Regression tests ensuring legacy harness/gateway behavior parity.
- [x] E2E continuity tests retain tool-trace context behavior.

## CP8: Docs and Status

- [x] Update `docs/status.md` progression.
- [x] Update `docs/adr/README.md` for ADR-0036.
- [x] Update relevant harness/extensions/config READMEs.
