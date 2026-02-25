# ADR-0022: Shell Tool v1 Uses Generic `shell` Name and `shell.exec` Runtime Action

- Status: Accepted
- Date: 2026-02-25
- Deciders: Protege team
- Technical Story: Add practical command execution capability across shell environments without binding to one shell brand.

## Context

Protege needs a command-execution tool for local automation workflows. Naming it `bash` would incorrectly imply one shell implementation and reduce portability across Linux/macOS/Windows runtimes.

## Decision

1. Tool name is `shell` (not `bash`).
2. Tool delegates to runtime action `shell.exec`.
3. Required input:
   - `command` (string)
4. Optional input:
   - `timeoutMs`
   - `workdir`
   - `maxOutputChars`
5. Runtime returns:
   - `exitCode`
   - `stdout`
   - `stderr`
   - `timedOut`
   - `durationMs`
   - execution context (`cwd`, `shell`, `shellType`, `platform`)
6. Runtime blocks `workdir` path traversal outside workspace root.

## Consequences

Positive:

1. Portable naming and behavior across shell types.
2. Clear structured output for the model to reason about command success/failure.
3. Bounded execution via timeout and output limits.

Tradeoffs:

1. Commands remain non-interactive in v1.
2. Environment variability can still affect command behavior.
3. No policy-based command allow/deny model in v1.

## Alternatives Considered

1. `bash` tool name:
   - rejected as too narrow and misleading.
2. Multiple shell-specific tools (`bash`, `zsh`, `powershell`):
   - rejected for unnecessary surface complexity.
3. Rich command policy system in v1:
   - rejected to keep implementation focused and usable.
