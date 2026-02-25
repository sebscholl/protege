# edit-file

Extension Surface: Yes

Edits UTF-8 text files with literal replacement semantics.

## Tool Name

- `edit_file`

## Input

- `path` (string, required): workspace-relative or absolute file path.
- `oldText` (string, required): literal text to find.
- `newText` (string, required): replacement text.
- `replaceAll` (boolean, optional): when true, replace all matches; otherwise replace first.

## Behavior

1. Validates required input shape.
2. Delegates to runtime action `file.edit`.
3. Returns runtime result payload.

## Notes

1. Matching is literal in v1 (no regex).
2. Path traversal outside workspace root is blocked by runtime action policy.
