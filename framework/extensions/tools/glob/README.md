# glob

Extension Surface: Yes

Finds file paths matching one glob pattern.

## Tool Name

- `glob`

## Input

- `pattern` (string, required): glob pattern to match.
- `cwd` (string, optional): search root relative to workspace.
- `maxResults` (integer, optional): cap returned path count (default runtime cap applies).

## Behavior

1. Validates input shape.
2. Delegates to runtime action `file.glob`.
3. Returns runtime path matches.

## Notes

1. Results are workspace-relative paths.
2. Runtime path policy in v1 allows local-machine paths outside workspace root.
