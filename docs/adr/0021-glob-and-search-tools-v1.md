# ADR-0021: Glob and Search Discovery Tools (v1)

- Status: Accepted
- Date: 2026-02-25
- Deciders: Protege team
- Technical Story: Add practical file discovery primitives for autonomous local workflows.

## Context

After introducing core file mutation tools (`read_file`, `write_file`, `edit_file`), Protege needs complementary discovery capabilities so the model can locate files and find relevant content before acting.

The immediate objective is usefulness and reliability with minimal conceptual overhead.

## Decision

1. Add two first-party tools under `extensions/tools/`:
   - `glob` (tool name `glob`)
   - `search` (tool name `search`)
2. Runtime action mappings:
   - `glob` delegates to `file.glob`
   - `search` delegates to `file.search`
3. Semantics:
   - `glob` returns matching file paths from a pattern.
   - `search` returns structured text matches with path/line/column/preview.
4. Keep behavior simple and deterministic:
   - default to workspace-root scope when no explicit path/cwd is provided
   - allow fixed-string search by default, optional regex mode
5. Maintain minimal runtime guardrail:
   - resolved paths must stay inside workspace root.

## Consequences

Positive:

1. The model can discover project structure and content without guessing.
2. Common autonomous coding/research loops become practical and faster.
3. Behavior stays predictable and easy to test.

Tradeoffs:

1. Results are text-oriented; binary content workflows remain out of scope.
2. Broad patterns/queries can return large result sets and need caps.
3. `ripgrep` availability is now an implicit runtime dependency for discovery actions.

## Alternatives Considered

1. No discovery tools in v1:
   - too limiting for real autonomous behavior.
2. One overloaded "find" tool only:
   - less clear than separating path discovery vs content search.
3. Rich indexed search subsystem first:
   - more power, too much complexity for this phase.
