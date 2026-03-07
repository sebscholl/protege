# Daemon Operations

Use the daemon command group to run the gateway under Linux `systemd` instead of a foreground terminal process.

## Scope

- Linux only (`systemd`)
- user scope default (`--user`)
- optional system scope (`--system`)

## Install and Start

```bash
protege daemon install --user
protege daemon start --user
protege daemon status --user --json
```

`install` writes a workspace-scoped unit and runs `systemctl daemon-reload`.

## Reinstall

Use reinstall after moving workspace paths, changing node/protege install locations, or updating daemon template behavior.

```bash
protege daemon reinstall --user
```

Reinstall does:

1. uninstall existing unit (if installed)
2. generate a fresh unit
3. reload `systemd`

## Unit Resolution Rules

For `status`, `info`, `logs`, `start`, `stop`, `restart`, `enable`, `disable`, `uninstall`:

1. if `--unit <name>` is provided, that unit is used
2. else if exactly one matching Protege unit exists, it is used
3. else workspace hash from `--cwd` (or current directory) is used when present
4. else command fails with an explicit disambiguation error

Use `--unit` to avoid ambiguity on multi-workspace hosts.

## Logs

```bash
protege daemon logs --user --lines 300
protege daemon logs --user --follow
protege daemon logs --user --unit protege-gateway-abc123.service --follow
```

## Info and Status

```bash
protege daemon info --user --json
protege daemon status --user --json
```

`info` includes fragment path, PID, restart counters, and environment file details.

## Uninstall Semantics

```bash
protege daemon uninstall --user
```

If the unit is already absent, uninstall is a no-op with explicit skipped output (`unit_not_installed`), not a false success.

## Troubleshooting

If daemon appears active but command output looks wrong:

1. inspect resolved unit:
   - `protege daemon info --user --json`
2. pin unit explicitly:
   - `protege daemon logs --user --unit <unit-name> --follow`
3. cross-check with systemd:
   - `systemctl --user status <unit-name> --no-pager`
   - `journalctl --user -u <unit-name> -n 300 --no-pager`

If restart loops occur with exit code `127`, reinstall to refresh `ExecStart`:

```bash
protege daemon reinstall --user
```
