# ADR-0020: Core File Tools v1 Use Simple, Literal, Reliable Semantics

- Status: Accepted
- Date: 2026-02-25
- Deciders: Protege team
- Technical Story: Add practical local file manipulation primitives that match common agent harness capabilities.
- Superseded In Part By: ADR-0025 (workspace-root path guardrail removed for v1 file/discovery actions)

## Context

Protege needs core local tools for practical autonomy: read files, write files, and edit files. The immediate priority is usefulness and reliability, not advanced configurability or hardening policy.

## Decision

1. Add three first-party tools under `extensions/tools/`:
   - `read-file` (`read_file`)
   - `write-file` (`write_file`)
   - `edit-file` (`edit_file`)
2. Tool semantics are intentionally simple:
   - `read_file(path)` returns full UTF-8 text content.
   - `write_file(path, content)` creates or overwrites file content.
   - `edit_file(path, oldText, newText, replaceAll?)` performs literal replacement only.
3. `edit_file` v1 does not support regex or patch syntax.
4. Runtime support is provided through generic runtime actions:
   - `file.read`
   - `file.write`
   - `file.edit`
5. Keep runtime behavior deterministic and literal; path policy is defined by ADR-0025 for v1.

## Consequences

Positive:

1. Aligns with widely expected harness capabilities for coding and automation tasks.
2. Low cognitive overhead for models and users.
3. Deterministic behavior that is straightforward to test.

Tradeoffs:

1. No advanced edit semantics (regex/structured patch) in v1.
2. No fine-grained allow/deny path policy in v1.
3. Text-first behavior is expected; binary workflows are out of scope for now.

## Alternatives Considered

1. Full patch engine first:
   - more powerful, but unnecessary complexity for this phase.
2. Regex-based edit v1:
   - flexible, but easier to misuse and harder to keep deterministic.
3. Security-heavy path policy now:
   - stronger constraints, but conflicts with current delivery priorities.
