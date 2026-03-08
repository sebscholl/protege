# Daemon Operations

The daemon command group lets you run the Protege gateway as a `systemd` service instead of a foreground terminal process. This is useful for servers and long-running deployments.

**Linux only** — requires `systemd`.

## Quick Start

```bash
# Install the systemd unit
protege daemon install --user

# Start the daemon
protege daemon start --user

# Check status
protege daemon status --user

# View logs
protege daemon logs --user --follow
```

## Install

`install` creates a workspace-scoped systemd unit file and runs `systemctl daemon-reload`:

```bash
protege daemon install --user
```

The generated unit runs `protege gateway start` as the service command, using the current workspace directory as the working directory.

Options:
- `--env-file <path>` — point the unit at a specific environment file
- `--force` — overwrite an existing unit

## Reinstall

Use `reinstall` after moving your workspace, updating your Node.js installation, or changing the Protege binary path:

```bash
protege daemon reinstall --user
```

This uninstalls the old unit, generates a fresh one, and reloads systemd.

## Uninstall

```bash
protege daemon uninstall --user
```

If the unit is already absent, this is a no-op with explicit output (`unit_not_installed`).

## Start, Stop, Restart

```bash
protege daemon start --user
protege daemon stop --user
protege daemon restart --user
```

## Enable / Disable Auto-Start

```bash
protege daemon enable --user     # Start automatically on boot/login
protege daemon disable --user    # Don't start automatically
```

## Status and Info

```bash
protege daemon status --user --json
protege daemon info --user --json
```

`info` shows detailed unit information including fragment path, PID, restart counters, and environment file details.

## Logs

```bash
protege daemon logs --user --lines 300
protege daemon logs --user --follow
```

## User vs System Scope

| Flag | Scope | When to use |
|------|-------|-------------|
| `--user` (default) | Current user | Personal machines, development |
| `--system` | System-wide | Production servers |

## Unit Resolution

When you run commands like `status`, `logs`, or `stop`, the daemon needs to find the right systemd unit. It resolves in this order:

1. **`--unit <name>`** — if you specify the unit explicitly, that's used
2. **Single match** — if exactly one Protege unit exists, it's used automatically
3. **Workspace hash** — uses the current directory (or `--cwd`) to find the matching unit
4. **Ambiguity error** — if multiple units match and none is unambiguous, the command fails with a helpful message

On multi-workspace hosts, use `--unit` to avoid ambiguity:

```bash
protege daemon logs --user --unit protege-gateway-abc123.service --follow
```

## Troubleshooting

### Exit code 127 restart loops

The `ExecStart` path is stale — Node.js or Protege moved. Fix with:

```bash
protege daemon reinstall --user
```

### Can't determine which unit to use

Inspect available units:

```bash
protege daemon info --user --json
```

Pin the unit explicitly:

```bash
protege daemon status --user --unit <unit-name>
```

### Cross-check with systemd directly

```bash
systemctl --user status protege-gateway-abc123.service --no-pager
journalctl --user -u protege-gateway-abc123.service -n 300 --no-pager
```
