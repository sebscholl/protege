# Tools

Extension Surface: Yes

Tool extensions expose callable capabilities to the inference harness.

Tool contracts should stay stable and explicitly documented per extension.

## Tool Structure

Each tool must be implemented as:

1. `extensions/tools/{tool-name}/index.ts`
2. `extensions/tools/{tool-name}/README.md`

`index.ts` is the tool's sole code entry point and exports the tool definition and execution method.

## Isolation Boundary

1. Tool-specific request/response types must live inside the tool directory.
2. Tool-specific validation and mapping logic must live inside the tool directory.
3. Core engine code may only depend on generic tool contracts (`name`, `description`, `inputSchema`, `execute`) and generic runtime invocation.
4. If logic only applies to one tool, it belongs in that tool's directory.

## Current Tools

1. `shell`: Executes non-interactive shell commands through `shell.exec`.
2. `glob`: Finds files by glob pattern through `file.glob`.
3. `search`: Finds text matches by query through `file.search`.
4. `read-file`: Reads full UTF-8 file content through `read_file`.
5. `write-file`: Creates or overwrites UTF-8 file content through `write_file`.
6. `edit-file`: Applies literal text replacement edits through `edit_file`.
7. `send-email`: Sends outbound email via generic runtime action invocation.
8. `web-fetch`: Fetches one HTTP(S) URL through `web_fetch`.
9. `web-search`: Searches the web through `web_search` using config-selected providers.

Each tool lives in its own directory with `index.ts` and `README.md`. Optional static assets/config files are allowed when needed, but config defaults should live in tool code and overrides belong in `extensions/extensions.json`.
