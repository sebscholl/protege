# Daemon Manual Validation Checklist

## Preconditions

1. Build and link current CLI.
2. Ensure target Protege workspace has `.secrets`.

```bash
npm run build
npm link
cd /path/to/protege-workspace
ls .secrets
```

## Lifecycle validation

1. Install user-scoped daemon.

```bash
protege daemon install --user
```

Expected: `Daemon Installed` with workspace-scoped unit name (`protege-gateway-<hash>.service`).

2. Start and check status.

```bash
protege daemon start --user
protege daemon status --user
```

Expected: active/running.

3. Inspect daemon info.

```bash
protege daemon info --user
```

Expected: correct workspace path, fragment path, PID, restart count fields.

4. Inspect logs.

```bash
protege daemon logs --user --lines 50
protege daemon logs --user --follow
```

5. Restart and re-check status.

```bash
protege daemon restart --user
protege daemon status --user
```

6. Stop and verify inactive.

```bash
protege daemon stop --user
protege daemon status --user
```

7. Reinstall behavior.

```bash
protege daemon reinstall --user
protege daemon status --user
```

Expected: reinstall succeeds even with stale unit state.

8. Uninstall idempotency.

```bash
protege daemon uninstall --user
protege daemon uninstall --user
```

Expected: safe teardown behavior.

## Optional direct systemd checks

```bash
systemctl --user list-units 'protege-gateway-*.service'
systemctl --user list-unit-files 'protege-gateway-*.service'
```
