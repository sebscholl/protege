# CLI Reference

Top-level usage:

```bash
protege <gateway|daemon|persona|relay|scheduler|status|logs|doctor|init|setup|chat> ...
```

## Global Flags

- `-h`, `--help`, `help`: show command help
- `-v`, `--version`, `version`: show installed CLI version

## `protege gateway`

```bash
protege gateway <start|stop|restart> [--dev]
```

- `start`: start gateway runtime
- `stop`: stop tracked gateway process
- `restart`: stop + start
- `--dev`: force runtime mode `dev`

## `protege daemon`

```bash
protege daemon <install|reinstall|uninstall|start|stop|restart|status|info|logs|enable|disable> [options]
```

Common options:

- `--user` (default)
- `--system`
- `--cwd <path>`
- `--unit <name>` (explicit unit override)
- `--name <base>`
- `--json` (status/info/install/uninstall)

Install/reinstall options:

- `--env-file <path>`
- `--force` (install only)

Logs options:

- `--follow`
- `--lines <n>`

See `Daemon Operations` for lifecycle semantics, unit resolution, and troubleshooting details.

## `protege persona`

```bash
protege persona create [display_name] [--name <display_name>] [--json]
protege persona list [--json]
protege persona info <persona_id_or_prefix> [--json]
protege persona delete <persona_id_or_prefix> [--json]
```

## `protege relay bootstrap`

```bash
protege relay bootstrap \
  [--relay-ws-url <ws://...|wss://...>] \
  [--reconnect-base-delay-ms <n>] \
  [--reconnect-max-delay-ms <n>] \
  [--heartbeat-timeout-ms <n>] \
  [--json]
```

## `protege scheduler`

```bash
protege scheduler sync [--persona <persona_id_or_prefix>] [--json]
```

## `protege status`

```bash
protege status [--json]
```

## `protege logs`

```bash
protege logs \
  [--follow] \
  [--tail <n>] \
  [--scope <gateway|harness|relay|scheduler|chat|all>] \
  [--json]
```

## `protege doctor`

```bash
protege doctor [--json]
```

## `protege init`

```bash
protege init [--path <dir>] [--reset|--force] [--json]
```

Scaffold-only command.

## `protege setup`

```bash
protege setup [options] [--json]
```

Primary options:

- `--path <dir>`
- `--reset` (or `--force`)
- `--provider <openai|anthropic|gemini|grok>`
- `--inference-api-key <key>`
- `--outbound <relay|local>`
- `--relay-ws-url <ws://...|wss://...>`
- `--web-search-provider <none|perplexity|tavily>`
- `--web-search-api-key <key>`
- `--admin-contact-email <email>`
- `--doctor`
- `--non-interactive`

## `protege chat`

```bash
protege chat [--persona <persona_id_or_prefix>] [--thread <thread_id>]
```

Terminal inbox/thread interface over persisted message threads.
