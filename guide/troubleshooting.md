# Troubleshooting

## `status` Shows `gateway.running: false` Unexpectedly

1. Ensure gateway process is running:
```bash
protege gateway start
```
2. Re-check:
```bash
protege status
```
3. If stale pid state exists:
```bash
protege gateway stop
```
Then start again.

## `logs` Fails with Log File Not Found

1. Confirm `config/system.json` and `logs_dir_path`.
2. Start gateway to generate runtime events.
3. Retry:
```bash
protege logs --tail 50
```

## `doctor` Returns `unhealthy`

Run:
```bash
protege doctor --json
```
Inspect failed checks and follow each check's `hint`.

Common failures:

1. Missing or invalid `config/gateway.json`.
2. No active persona selected.
3. Missing provider API key in inference config.
4. Missing or invalid `extensions/extensions.json`.

## Relay Receives Inbound but No Outbound Delivery

1. Check local runtime logs:
```bash
protege logs --scope gateway --tail 200
```
2. Check relay server logs via deployment scripts.
3. Verify SPF/PTR configuration for relay sender domain/IPs.

## Gmail Replies Not Threading

1. Default behavior uses same-thread reply mode.
2. Ensure tool calls are not intentionally using `threadingMode: "new_thread"`.
3. Confirm outbound headers include expected `In-Reply-To` and `References` chain.
