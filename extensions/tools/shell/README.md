# shell

Extension Surface: Yes

Executes non-interactive shell commands and returns structured command results.

## Tool Name

- `shell`

## Input

- `command` (string, required): command text to execute.
- `timeoutMs` (integer, optional): timeout in milliseconds.
- `workdir` (string, optional): working directory relative to workspace root.
- `maxOutputChars` (integer, optional): output cap for stdout/stderr.

## Behavior

1. Validates input shape.
2. Delegates to runtime action `shell.exec`.
3. Returns command status/output metadata.

## Notes

1. Commands execute non-interactively.
2. Runtime blocks `workdir` path traversal outside workspace root.
