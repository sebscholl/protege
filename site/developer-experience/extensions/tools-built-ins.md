# Built-In Tools

Built-in tools currently enabled in `extensions/extensions.json`:

1. `shell`
2. `glob`
3. `search`
4. `read-file`
5. `write-file`
6. `edit-file`
7. `web-fetch`
8. `web-search`
9. `send-email`

## Runtime Actions Used

The tool layer invokes these runtime actions through `context.runtime.invoke`:

1. `shell.exec`
2. `file.glob`
3. `file.search`
4. `file.read`
5. `file.write`
6. `file.edit`
7. `web.fetch`
8. `web.search`
9. `email.send`

## Configure Built-Ins

### String entries (defaults)

```json
{
  "tools": [
    "shell",
    "read-file",
    "write-file",
    "send-email"
  ]
}
```

### Object entries (override config)

```json
{
  "tools": [
    {
      "name": "web-search",
      "config": {
        "provider": "perplexity",
        "defaultMaxResults": 5
      }
    },
    {
      "name": "web-fetch",
      "config": {
        "description": "Fetch HTTP(S) documents for synthesis"
      }
    }
  ]
}
```

## Default Config Files

Tool-local defaults live in each `extensions/tools/{tool}/config.json`.

Notable built-in config surfaces:

1. `web-search`:
   1. `provider`: `tavily | perplexity`
   2. `defaultMaxResults`
   3. `providers.{name}.apiKeyEnv`
   4. `providers.{name}.baseUrl`
2. `web-fetch`:
   1. metadata fields such as `name`, `runtimeAction`, `version`, `description`

## Tool Naming

Manifest name (`web-search`) maps to exported tool name (`web_search`) inside `index.ts`. Callers (models/providers) interact with the exported tool name.

## Related

1. [Build a custom tool](/developer-experience/extensions/tools-custom)
