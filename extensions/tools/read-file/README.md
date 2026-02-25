# read-file

Extension Surface: Yes

Reads full UTF-8 text content from a file path.

## Tool Name

- `read_file`

## Input

- `path` (string, required): workspace-relative or absolute file path.

## Behavior

1. Validates required input shape.
2. Delegates to runtime action `file.read`.
3. Returns runtime result payload.

## Notes

1. `read_file` is text-first in v1.
2. Path traversal outside workspace root is blocked by runtime action policy.
