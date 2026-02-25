# search

Extension Surface: Yes

Searches file contents and returns structured text matches.

## Tool Name

- `search`

## Input

- `query` (string, required): search pattern text.
- `path` (string, optional): search root relative to workspace.
- `isRegex` (boolean, optional): enable regex matching.
- `maxResults` (integer, optional): cap number of returned matches.

## Behavior

1. Validates input shape.
2. Delegates to runtime action `file.search`.
3. Returns structured match metadata.

## Notes

1. Results include `path`, `line`, `column`, and `preview`.
2. Runtime blocks path traversal outside workspace root.
