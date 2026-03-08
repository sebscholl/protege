# Troubleshooting

Common issues and how to resolve them.

## Setup and Configuration

### `protege doctor` returns unhealthy

Run the detailed check:

```bash
protege doctor --json
```

Common causes:
- **Missing config file** — run `protege setup` or `protege init` to regenerate
- **No personas created** — create one with `protege persona create "My Agent"`
- **Missing API key** — check that the required env var is set in `.secrets` (e.g., `ANTHROPIC_API_KEY=sk-ant-...`)
- **Invalid `extensions/extensions.json`** — verify JSON syntax and that all referenced extensions exist

### Web search fails with "missing environment variable"

The `web-search` tool needs an API key for its configured provider:

```bash
# Add to .secrets
TAVILY_API_KEY=tvly-...
# or
PERPLEXITY_API_KEY=pplx-...
```

Then restart any running gateway process so the new env is loaded.

## Gateway

### `protege status` shows gateway not running

```bash
# Start it
protege gateway start

# If a stale PID file is the issue, stop first
protege gateway stop
protege gateway start
```

### Gateway starts but no emails arrive

1. Check if relay is connected:
   ```bash
   protege logs --scope gateway --tail 50
   ```
   Look for `gateway.relay.authenticated` events.

2. If using local SMTP, verify `configs/gateway.json` has correct `host` and `port` settings and that the port is reachable.

3. Verify the sender isn't blocked by the access policy:
   ```bash
   # Check configs/security.json
   # Make sure the sender address matches an allow rule
   ```

### Outbound emails aren't delivered

1. Check logs for delivery events:
   ```bash
   protege logs --scope gateway --tail 100
   ```
   Look for `gateway.outbound.sent` or `gateway.outbound.sent_via_relay`.

2. Verify outbound transport is configured — either `transport` block in `configs/gateway.json` or `relay.enabled: true`.

3. If using relay, check that the relay server is running and the connection is active.

4. If using direct SMTP, verify your transport credentials and that the SMTP server is reachable.

## Email Threading

### Gmail replies create new threads instead of continuing

1. The default behavior uses same-thread reply mode — this should work correctly.
2. Check if the LLM is explicitly requesting `threadingMode: "new_thread"`.
3. Verify outbound emails include `In-Reply-To` and `References` headers:
   ```bash
   protege logs --scope gateway --tail 100
   ```

### Emails land in spam

If using relay mode with your own relay server:
- Configure **SPF** for the relay domain
- Set **PTR/rDNS** for the relay IP
- Publish a **DMARC** policy
- Check your relay IP isn't on any blocklists

## Chat

### "Persona not found" error

```bash
# List available personas
protege persona list

# Use the full ID or an unambiguous prefix
protege chat --persona 5d5291bc3285362f
protege chat --persona 5d52
```

### Sending does nothing in an existing thread

Existing threads (from real email) are **read-only** in chat v1. To chat with your agent:

1. Press `Ctrl+N` to create a new writable thread
2. Press `i` to enter compose mode
3. Type and press `Ctrl+S` to send

### `Ctrl+Enter` doesn't send

Terminal emulators handle `Ctrl+Enter` inconsistently. Use `Ctrl+S` as the primary send shortcut.

## Scheduler

### Scheduler won't start

```bash
# Check if node-cron is installed
npm ls node-cron

# If missing
npm install node-cron@4.2.1
```

### Scheduled tasks run but no emails arrive

1. The gateway must be running for outbound email:
   ```bash
   protege gateway start
   ```
2. Verify outbound transport is configured (either `transport` or `relay.enabled: true` in `configs/gateway.json`).
3. Check scheduler logs:
   ```bash
   protege logs --scope scheduler --tail 100
   ```

### Tasks appear backlogged

Check the concurrency limit in `configs/system.json`:

```json
{
  "scheduler": {
    "max_global_concurrent_runs": 5
  }
}
```

If runs are consistently queuing, increase the limit carefully. Also check if individual runs are taking too long (e.g., slow LLM responses or tool calls).

## Failure Alerts

### Alert emails aren't sent

1. Set `admin_contact_email` in `configs/system.json`:
   ```json
   {
     "admin_contact_email": "admin@example.com"
   }
   ```
2. Verify with `protege doctor --json`
3. Check for `gateway.alert.*` and `scheduler.alert.*` events in logs

## Daemon (Linux)

### Daemon restarts in a loop (exit code 127)

The `ExecStart` path in the systemd unit is stale (e.g., Node.js or Protege was reinstalled to a different location):

```bash
protege daemon reinstall --user
protege daemon start --user
```

### Multiple workspaces cause ambiguity

Use `--unit` to pin the exact unit:

```bash
protege daemon status --user --unit protege-gateway-abc123.service
protege daemon logs --user --unit protege-gateway-abc123.service --follow
```

Or check which units exist:

```bash
protege daemon info --user --json
```
