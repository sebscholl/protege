# write-file

Extension Surface: Yes

Creates or overwrites UTF-8 text files.

## Tool Name

- `write_file`

## Input

- `path` (string, required): workspace-relative or absolute file path.
- `content` (string, required): full replacement file content.

## Behavior

1. Validates required input shape.
2. Delegates to runtime action `file.write`.
3. Returns runtime result payload.

## Notes

1. Parent directories are created when missing.
2. Path traversal outside workspace root is blocked by runtime action policy.
