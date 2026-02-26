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
2. No personas created.
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

1. Chat v1 treats existing threads as read-only by design.
2. Create a local writable thread from inbox with `Ctrl+N`.
3. Send with `Ctrl+S` in that writable local thread (`Ctrl+Enter` is also accepted as a fallback on terminals that emit it distinctly).

## Chat `Ctrl+Enter` Does Not Trigger Send

1. Terminal apps can emit `Ctrl+Enter` inconsistently.
2. Use `Ctrl+S` as the primary send shortcut.
3. Keep `Ctrl+Enter` only as an optional fallback when your terminal reports it distinctly.

## Chat UI Looks Corrupted While Running

1. Confirm you are on a recent build where chat runtime logs are suppressed from console output.
2. Use file logs for runtime details:
```bash
protege logs --scope chat --tail 200
```

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

1. Ensure gateway runtime is running (scheduler is hosted by gateway):
```bash
protege gateway start
```
2. Ensure `config/gateway.json` has either:
   - a valid `transport` block, or
   - `relay.enabled: true` with a connected relay client persona.
3. Verify `mailDomain` is configured to a non-`localhost` domain when relay mode is enabled.
4. Check runtime logs:
```bash
protege logs --scope scheduler --tail 200
```

## Runtime Failure Alerts Are Not Sent

1. Set `admin_contact_email` in `config/system.json`.
2. Ensure it is a valid email address.
3. Run:
```bash
protege doctor --json
```
4. Check `scheduler.admin_contact_email_configured` result.
5. Confirm logs include either:
   - `gateway.alert.sent` / `scheduler.alert.sent`, or
   - explicit skip/failure events with context.

## Web Search Fails with Missing Environment Variable

If you see errors like:

`web_search requires environment variable "<NAME>".`

1. Ensure `extensions/tools/web-search/config.json` uses env variable names in `apiKeyEnv` (not raw API key values).
2. Add keys to `.env` (or export them in your shell):
```bash
TAVILY_API_KEY=tvly-...
PERPLEXITY_API_KEY=pplx-...
```
3. Restart the running Protege process (`gateway` and/or `chat`) so new env values are available.

## Scheduler Appears Backlogged

1. Scheduler now enforces bounded concurrency.
2. Check `config/system.json`:
   - `scheduler.max_global_concurrent_runs`
   - `scheduler.max_per_persona_concurrent_runs`
3. Increase limits carefully if runs are consistently queued.
