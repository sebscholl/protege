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

## `logs` Fails with Log File Not Found

1. Confirm `configs/system.json` and `logs_dir_path`.
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

Common failures:

1. Missing or invalid `configs/gateway.json`.
2. No personas created.
3. Missing provider API key in env.
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
3. Confirm outbound headers include expected `In-Reply-To` and `References`.

## Chat Says Persona Not Found

1. List personas:
```bash
protege persona list
```
2. Retry chat using full `persona_id` or an unambiguous prefix:
```bash
protege chat --persona <persona_id_or_prefix>
```

## Chat Send Does Nothing in Existing Threads

1. Existing threads are read-only in chat v1.
2. Create a local writable thread from inbox with `Ctrl+N`.
3. Send with `Ctrl+S`.

## Chat `Ctrl+Enter` Does Not Trigger Send

1. Terminal apps emit `Ctrl+Enter` inconsistently.
2. Use `Ctrl+S` as the primary send shortcut.

## Scheduler Fails to Start with `node-cron` Error

1. Ensure scheduler dependency is installed:
```bash
npm ls node-cron
```
2. If missing, install:
```bash
npm install node-cron@4.2.1
```

## Scheduler Runs but No Emails Are Delivered

1. Ensure gateway runtime is running:
```bash
protege gateway start
```
2. Ensure `configs/gateway.json` has either:
   - a valid `transport` block, or
   - `relay.enabled: true` with connected relay clients.
3. Check runtime logs:
```bash
protege logs --scope scheduler --tail 200
```

## Runtime Failure Alerts Are Not Sent

1. Set `admin_contact_email` in `configs/system.json`.
2. Run:
```bash
protege doctor --json
```
3. Check for `gateway.alert.*` and `scheduler.alert.*` events in logs.

## Web Search Fails with Missing Environment Variable

1. Configure provider env keys in `.env` or shell:
```bash
TAVILY_API_KEY=tvly-...
PERPLEXITY_API_KEY=pplx-...
```
2. Restart running processes so env changes are loaded.

## Scheduler Appears Backlogged

1. Check `configs/system.json`:
   - `scheduler.max_global_concurrent_runs`
2. Increase carefully if runs are consistently queued.
