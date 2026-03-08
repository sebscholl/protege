# Tools

Tools are the actions your agent can take during an inference run. When the LLM decides it needs to search the web, read a file, or send an email, it calls a tool. Protege executes the tool and feeds the result back to the LLM so it can continue reasoning.

## Built-In Tools

Protege ships with nine tools that cover file operations, web access, shell execution, and email:

### `send-email` — Send outbound email

The most important tool. This is how your agent replies to messages and communicates with the outside world.

```json
// Tool name exposed to the LLM: send_email
// Runtime action: email.send
{
  "to": ["alice@example.com"],
  "subject": "Weekly Report",
  "text": "Here's your summary...",
  "cc": ["bob@example.com"],
  "threadingMode": "reply_current"
}
```

The `threadingMode` field controls email threading:
- `reply_current` (default) — replies in the same thread as the incoming message
- `new_thread` — starts a fresh email thread

### `web-search` — Search the web

Queries a web search provider and returns results. Supports [Tavily](https://tavily.com) and [Perplexity](https://perplexity.ai) as backends.

```json
// Tool name: web_search
// Runtime action: web.search
{
  "query": "latest Node.js LTS version",
  "maxResults": 5
}
```

Configure the search provider in the manifest:

```json
{
  "name": "web-search",
  "config": {
    "provider": "tavily",
    "defaultMaxResults": 5
  }
}
```

Requires a `TAVILY_API_KEY` or `PERPLEXITY_API_KEY` in your `.secrets` file.

### `web-fetch` — Fetch a web page

Downloads the content of an HTTP(S) URL for the agent to read and analyze.

```json
// Tool name: web_fetch
// Runtime action: web.fetch
{
  "url": "https://example.com/api/status"
}
```

### `shell` — Run shell commands

Executes a command in the system shell and returns stdout/stderr.

```json
// Tool name: shell
// Runtime action: shell.exec
{
  "command": "df -h"
}
```

::: warning
The shell tool runs with the same permissions as the Protege process. See [Security](/developer-experience/security) for hardening guidance.
:::

### `read-file` — Read a file

```json
// Tool name: read_file → Runtime action: file.read
{ "path": "/home/user/data/report.csv" }
```

### `write-file` — Write a file

```json
// Tool name: write_file → Runtime action: file.write
{ "path": "/home/user/output/summary.txt", "content": "..." }
```

### `edit-file` — Edit a file

```json
// Tool name: edit_file → Runtime action: file.edit
{ "path": "/home/user/config.yaml", "oldText": "debug: false", "newText": "debug: true" }
```

### `glob` — Find files by pattern

```json
// Tool name: glob → Runtime action: file.glob
{ "pattern": "**/*.md", "cwd": "/home/user/docs" }
```

### `search` — Search file contents

```json
// Tool name: search → Runtime action: file.search
{ "query": "TODO", "path": "/home/user/project" }
```

## Manifest Configuration

### Enable tools with defaults

```json
{
  "tools": ["shell", "read-file", "write-file", "send-email", "web-search"]
}
```

### Override tool configuration

```json
{
  "tools": [
    "shell",
    "read-file",
    {
      "name": "web-search",
      "config": {
        "provider": "perplexity",
        "defaultMaxResults": 10
      }
    }
  ]
}
```

## Tool Naming Convention

The manifest uses kebab-case names (`web-search`), but the tool name exposed to the LLM uses snake_case (`web_search`). This is because LLM function-calling APIs work better with snake_case identifiers.

| Manifest Name | LLM Tool Name | Runtime Action |
|--------------|---------------|----------------|
| `send-email` | `send_email` | `email.send` |
| `web-search` | `web_search` | `web.search` |
| `web-fetch` | `web_fetch` | `web.fetch` |
| `shell` | `shell` | `shell.exec` |
| `read-file` | `read_file` | `file.read` |
| `write-file` | `write_file` | `file.write` |
| `edit-file` | `edit_file` | `file.edit` |
| `glob` | `glob` | `file.glob` |
| `search` | `search` | `file.search` |
