# Daemon Runtime and Ops Plan

Last Updated: 2026-03-07
Owner: Edgar
Status: Proposed (ready for implementation)

## Objective

Run Protege reliably in the background without requiring a foreground terminal, while providing strong operator controls so processes never become "ghost" workloads.

## Scope

1. Linux-first daemon support using `systemd`.
2. Strong lifecycle CLI for install/start/stop/restart/status/logs/info.
3. Keep existing foreground mode (`protege gateway start`) for development.

Out of scope for first pass:

1. Native launchd/Windows Service support.
2. PM2 integration as primary runtime.

## Why this approach

Current `gateway start/stop/restart` uses local PID file + process scan. That is functional but fragile under terminal/session loss and stale PIDs. For long-running operation, service managers are the correct primitive.

`systemd` gives:

1. restart policy and failure backoff.
2. durable process ownership.
3. journal log integration.
4. explicit enable/disable on boot.

## Proposed CLI Surface

New command group:

1. `protege daemon install [--user|--system] [--name protege-gateway] [--cwd <path>] [--env-file <path>] [--force]`
2. `protege daemon uninstall [--user|--system] [--name ...]`
3. `protege daemon start [--user|--system] [--name ...]`
4. `protege daemon stop [--user|--system] [--name ...]`
5. `protege daemon restart [--user|--system] [--name ...]`
6. `protege daemon status [--user|--system] [--name ...] [--json]`
7. `protege daemon logs [--user|--system] [--name ...] [--follow] [--lines <n>]`
8. `protege daemon info [--user|--system] [--name ...] [--json]`
9. `protege daemon enable [--user|--system] [--name ...]`
10. `protege daemon disable [--user|--system] [--name ...]`
11. `protege daemon reinstall [--user|--system] [--cwd <path>] [--env-file <path>]`

Behavior notes:

1. default scope is `--user` for local developer installs.
2. status/info/logs should fail with actionable message if service is not installed.
3. `--json` parity with other CLI commands.
4. daemon units are workspace-scoped (not global-singleton).

## Workspace-Scoped Unit Model

One unit is generated per workspace path.

1. Unit name format: `protege-gateway-<workspace-hash>.service`.
2. `--cwd` defaults to current working directory.
3. All lifecycle commands resolve workspace first, then map to that workspace unit.
4. `reinstall` semantics:
   1. stop + uninstall workspace unit if present,
   2. regenerate unit from current flags,
   3. daemon-reload + install + start (optional auto-start per command flag).

This allows multiple Protege workspaces on one machine without naming collisions.

## Service Unit Design

Generated unit template (`~/.config/systemd/user/protege-gateway.service` for user scope):

1. `ExecStart=<absolute-path-to-protege-binary> gateway start`
2. `WorkingDirectory=<workspace>`
3. `EnvironmentFile=<workspace>/.secrets` (if present)
4. `Restart=on-failure`
5. `RestartSec=2s`
6. `StartLimitIntervalSec=60`
7. `StartLimitBurst=5`
8. `KillSignal=SIGTERM`
9. `TimeoutStopSec=30`
10. `NoNewPrivileges=true`
11. `ProtectSystem=strict` (phase 2, after file-write path validation)
12. `ReadWritePaths=<workspace>`

`ExecStart` resolution policy during `protege daemon install`:

1. resolve `protege` via `command -v protege`,
2. store absolute resolved path in unit file (do not rely on shell `PATH` inside systemd),
3. fail install with actionable message when binary cannot be resolved.

`WorkingDirectory` and `EnvironmentFile` policy:

1. both are pinned to the target workspace resolved from `--cwd` (or `pwd`),
2. moving a workspace requires `protege daemon reinstall` for that workspace,
3. multiple workspaces produce separate units, each with its own working directory and secrets file.

## Port Ownership Rule (Important)

For direct SMTP ingress on one host/interface:

1. only one process can bind one `<host>:<port>` at a time,
2. when running in port-25 mode, treat Protege as single-process per host for that bind,
3. startup must fail fast on bind collision with explicit remediation text.

Relay connections are independent per persona identity, but local SMTP listener binds are shared OS resources.

## Runtime Changes Required

1. Ensure graceful shutdown on `SIGTERM` / `SIGINT`:
   1. stop SMTP listeners.
   2. stop scheduler.
   3. close DB handles.
   4. flush final logs.
2. Remove daemon dependency on `tmp/gateway.pid` for managed mode.
3. Keep PID marker only for legacy foreground stop path (short-term).

## Observability / Ghost-Process Prevention

`protege daemon info` should surface:

1. service state.
2. main PID.
3. start timestamp / uptime.
4. restart count (`NRestarts`).
5. last exit code/signal.
6. configured workspace and env file.

`protege daemon logs` should use journald bridge (`journalctl -u ...`).

## Implementation Phases

### Phase D1: Core service install/start/stop/status

1. unit file generator and installer.
2. CLI wrappers around `systemctl --user` (or `sudo systemctl` for system scope).
3. status parser with pretty and json output.
4. tests for command construction and parsing.
5. workspace-hash unit naming and `reinstall` path.
6. startup preflight: detect SMTP bind conflicts and emit actionable error.

### Phase D2: Logs/info/enable-disable + hardening

1. journald log command.
2. info command from `systemctl show`.
3. enable/disable support.
4. stale-state handling and actionable diagnostics.

### Phase D3: Foreground/managed mode reconciliation

1. document mode boundaries.
2. de-emphasize PID-file stop path.
3. add doctor checks for installed daemon health.

## Test Strategy

Unit tests:

1. unit-file rendering.
2. command invocation builder for user/system scopes.
3. status/info parser coverage.
4. failure mode formatting.

Integration tests (local runner):

1. install -> start -> status(active) -> stop -> status(inactive).
2. restart count increments on forced crash.
3. logs command tails service output.

Manual acceptance checklist:

1. close terminal after start; service remains active.
2. reboot machine (if enabled); service auto-starts.
3. `protege daemon stop` always terminates active process.

## Risks and Mitigations

1. `systemd` not available in some environments.
   1. Mitigation: explicit "Linux systemd required" error and fallback recommendation.
2. permission confusion between user/system scope.
   1. Mitigation: default to user scope, explicit flags, clear help text.
3. log duplication (journald + file logs).
   1. Mitigation: document behavior and keep both initially for troubleshooting.

## Decision checkpoint for tomorrow

1. Confirm CLI naming (`daemon` vs `service`).
2. Confirm Linux-only scope for v1 daemon support.
3. Confirm whether to retire PID-file stop flow immediately or in one transition release.
4. Confirm auto-start behavior for `reinstall`.

## Research references

1. systemd service semantics: https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html
2. systemd execution sandbox options: https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html
3. Node process signal handling: https://nodejs.org/api/process.html
