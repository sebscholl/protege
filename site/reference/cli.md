# CLI Reference

```bash
protege <command> [options]
```

Most commands render formatted output by default and switch to raw JSON with `--json`.

## Global Flags

| Flag | Description |
|------|-------------|
| `-h`, `--help`, `help` | Show help for any command |
| `-v`, `--version`, `version` | Show installed version |

---

## `protege setup`

Interactive guided setup for new projects. Creates config files, prompts for provider and keys, optionally bootstraps relay mode.

```bash
protege setup [options]
```

| Option | Description |
|--------|-------------|
| `--path <dir>` | Project directory (default: current) |
| `--reset`, `--force` | Overwrite existing config files |
| `--provider <name>` | LLM provider: `openai`, `anthropic`, `gemini`, `grok` |
| `--inference-api-key <key>` | Provider API key |
| `--outbound <mode>` | `relay` or `local` |
| `--relay-ws-url <url>` | Relay WebSocket URL |
| `--web-search-provider <name>` | `none`, `perplexity`, or `tavily` |
| `--web-search-api-key <key>` | Web search API key |
| `--admin-contact-email <email>` | Failure alert recipient |
| `--doctor` | Run health check after setup |
| `--non-interactive` | Skip all prompts, use flags only |
| `--json` | JSON output |

**Example: fully non-interactive setup**

```bash
protege setup \
  --non-interactive \
  --provider anthropic \
  --inference-api-key sk-ant-... \
  --outbound relay \
  --relay-ws-url wss://relay.protege.bot/ws \
  --web-search-provider tavily \
  --web-search-api-key tvly-... \
  --admin-contact-email admin@example.com \
  --doctor
```

---

## `protege init`

Scaffolds project files without the interactive wizard. Use this for advanced manual setup.

```bash
protege init [--path <dir>] [--reset|--force] [--json]
```

---

## `protege gateway`

Manage the gateway process (SMTP server + inference runtime).

```bash
protege gateway <start|stop|restart> [--dev]
```

| Subcommand | Description |
|------------|-------------|
| `start` | Start the gateway |
| `stop` | Stop the running gateway |
| `restart` | Stop and restart |

| Option | Description |
|--------|-------------|
| `--dev` | Run in dev mode (no real email delivery) |

**Example:**

```bash
protege gateway start
protege gateway start --dev    # Local development mode
protege gateway restart
```

---

## `protege persona`

Manage agent personas (identities).

```bash
protege persona <create|list|info|delete> [options]
```

| Subcommand | Description |
|------------|-------------|
| `create [name]` | Create a new persona |
| `list` | List all personas |
| `info <id>` | Show persona details |
| `delete <id>` | Delete a persona |

| Option | Description |
|--------|-------------|
| `--name <display_name>` | Display name (alternative to positional arg) |
| `--json` | JSON output |

**Examples:**

```bash
protege persona create "Research Assistant"
protege persona create --name "DevOps Bot"
protege persona list
protege persona list --json
protege persona info 5d52
protege persona delete 5d52
```

The `<id>` can be a full persona ID, a unique prefix, or an email local part.

---

## `protege relay bootstrap`

Configure relay mode for an existing project.

```bash
protege relay bootstrap [options]
```

| Option | Description |
|--------|-------------|
| `--relay-ws-url <url>` | WebSocket URL (e.g., `wss://relay.protege.bot/ws`) |
| `--reconnect-base-delay-ms <n>` | Initial reconnect delay |
| `--reconnect-max-delay-ms <n>` | Max reconnect delay |
| `--heartbeat-timeout-ms <n>` | Heartbeat timeout |
| `--json` | JSON output |

**Example:**

```bash
protege relay bootstrap --relay-ws-url wss://relay.protege.bot/ws
```

---

## `protege scheduler sync`

Sync responsibility markdown files to the database.

```bash
protege scheduler sync [--persona <id>] [--json]
```

**Example:**

```bash
protege scheduler sync                    # Sync all personas
protege scheduler sync --persona 5d52     # Sync one persona
```

---

## `protege chat`

Open the terminal inbox/thread client.

```bash
protege chat [--persona <id>] [--thread <thread_id>]
```

| Option | Description |
|--------|-------------|
| `--persona <id>` | Filter to one persona |
| `--thread <thread_id>` | Jump directly to a thread |

See the [Chat Guide](/reference/chat) for keybindings and usage.

---

## `protege status`

Show runtime status (gateway running, persona count, config validity).

```bash
protege status [--json]
```

---

## `protege doctor`

Run a comprehensive health check — validates config files, personas, provider keys, and extensions.

```bash
protege doctor [--json]
```

---

## `protege logs`

View runtime logs.

```bash
protege logs [options]
```

| Option | Description |
|--------|-------------|
| `--follow` | Stream new log entries |
| `--tail <n>` | Show last N lines |
| `--scope <name>` | Filter by scope: `gateway`, `harness`, `relay`, `scheduler`, `chat`, `all` |
| `--json` | Raw JSON log output |

**Examples:**

```bash
protege logs --scope gateway --follow     # Watch gateway events
protege logs --scope scheduler --tail 50  # Last 50 scheduler entries
protege logs --json                       # Machine-readable output
```

---

## `protege daemon`

Manage the gateway as a `systemd` service (Linux only).

```bash
protege daemon <subcommand> [options]
```

| Subcommand | Description |
|------------|-------------|
| `install` | Create and register a systemd unit |
| `reinstall` | Uninstall + fresh install |
| `uninstall` | Remove the systemd unit |
| `start` | Start the daemon |
| `stop` | Stop the daemon |
| `restart` | Restart the daemon |
| `status` | Show daemon status |
| `info` | Show unit details (path, PID, etc.) |
| `logs` | View daemon logs |
| `enable` | Enable auto-start on boot |
| `disable` | Disable auto-start |

| Option | Description |
|--------|-------------|
| `--user` | User-scope systemd (default) |
| `--system` | System-scope systemd |
| `--cwd <path>` | Workspace directory |
| `--unit <name>` | Explicit unit name |
| `--env-file <path>` | Environment file for the unit |
| `--force` | Force install over existing |
| `--follow` | Follow logs |
| `--lines <n>` | Number of log lines |
| `--json` | JSON output |

See [Daemon Operations](/reference/daemon) for full lifecycle docs.
