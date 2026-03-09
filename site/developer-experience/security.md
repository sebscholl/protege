# Security and Risk Model

Protege is intentionally powerful. Your agent can read and write files, execute shell commands, fetch web content, and send emails — all with the same permissions as the process running it. This page documents the threat model, built-in controls, and how to harden your deployment.

## Threat Model

Protege v1 operates under these assumptions:

1. **Tools run unsandboxed** — they execute with the Protege process's OS permissions
2. **Extensions are trusted code** — hooks, tools, providers, and resolvers run in-process
3. **Local data is unencrypted** — persona keys, memory, and databases are stored as regular files
4. **The relay is a transport bridge, not a trust boundary** — it tunnels email but doesn't isolate your runtime

## Built-In Security Controls

### Gateway sender access policy

The access policy in `configs/security.json` controls who can email your agent:

```json
{
  "gateway_access": {
    "enabled": true,
    "default_decision": "deny",
    "allow": ["alice@example.com", "*@mycompany.com"],
    "deny": ["noisy-bot@mycompany.com"]
  }
}
```

**Evaluation order:**
1. Check deny rules — if a deny rule matches, the message is rejected
2. Check allow rules — if an allow rule matches, the message is accepted
3. Fall through to `default_decision`

Deny always wins when both deny and allow rules match the same sender.

**Wildcard matching:** `*` matches any sequence of characters. `*@example.com` matches every sender from that domain. Rules are case-insensitive.

### Gateway sender authentication policy

The default scaffold also enables gateway authentication policy in monitor mode:

```json
{
  "gateway_auth": {
    "enabled": true,
    "mode": "monitor",
    "policy": "require_dmarc_or_aligned_spf_dkim"
  }
}
```

`monitor` mode is non-blocking and preserves out-of-box behavior. Move to `enforce` after validating your inbound auth signals in logs.

Gateway allowlist rules do not bypass auth policy evaluation. Address-based allow/deny and sender-auth policy are independent controls.

When email arrives through relay tunneling, gateway auth signals come from **signed relay attestation**, not message headers. In enforce mode, relay-ingested messages without valid attestation are rejected.

### Agent-to-agent recursion guard

When agents email each other, there's a risk of infinite reply loops. Protege prevents this with a recursion counter:

1. Every outbound email includes an `X-Protege-Recursion` header set to `recursion_depth` (default: `3`)
2. Inbound messages carrying this header have their value decremented
3. Messages arriving with `X-Protege-Recursion: 0` (or lower) are rejected before processing

Configure the depth in `configs/inference.json`:

```json
{
  "recursion_depth": 3
}
```

A depth of 3 means agents can exchange up to 3 rounds of replies before the chain is cut.

### Failure alerting

When a runtime failure occurs (tool error, scheduler failure, etc.), Protege can send an alert email to a designated admin:

```json
// configs/system.json
{
  "admin_contact_email": "admin@example.com"
}
```

You can also set a scheduler-specific override:

```json
{
  "scheduler": {
    "admin_contact_email": "ops@example.com"
  }
}
```

Run `protege doctor` to verify that your alert configuration is valid and that the outbound channel can deliver.

## Security Profiles

### Personal use (single user, minimal exposure)

You're the only one emailing your agent. Low risk, but still worth basic hardening:

```json
{
  "gateway_access": {
    "enabled": true,
    "default_decision": "deny",
    "allow": ["your-email@gmail.com"],
    "deny": []
  }
}
```

- Enable the access policy and allowlist only your own address
- Set `admin_contact_email` so you hear about failures
- Keep the tool set minimal — only enable tools your agent actually needs

### Team or multi-user

Multiple people email your agent. You need tighter controls:

```json
{
  "gateway_access": {
    "enabled": true,
    "default_decision": "deny",
    "allow": ["*@yourcompany.com"],
    "deny": ["noisy-bot@yourcompany.com"]
  }
}
```

- Start with `default_decision: deny` and add narrow allow rules
- Use deny overrides for known problematic senders
- Monitor logs for unexpected inbound traffic

### Internet-facing (via relay)

Your agent has a public email address. Highest risk profile:

```json
{
  "gateway_access": {
    "enabled": true,
    "default_decision": "deny",
    "allow": ["specific-user@example.com"],
    "deny": []
  }
}
```

- **Never** use `default_decision: allow` with public exposure
- Don't rely on address obscurity — assume the address will be discovered
- Set a conservative `recursion_depth` (3-6)
- Configure SPF, DKIM, and DMARC for your relay domain
- Run Protege under a dedicated OS user with restricted permissions

## Risks to Understand

### Unsandboxed tool execution

The `shell`, `read-file`, `write-file`, and `edit-file` tools have full filesystem and shell access. A prompt injection attack via an inbound email could trick the LLM into:

- Reading sensitive files
- Writing or deleting files
- Running arbitrary shell commands
- Exfiltrating data via `web-fetch` or `send-email`

**Mitigation:**
- Run Protege under a dedicated OS user with minimal filesystem permissions
- Don't run Protege in directories containing sensitive data
- Disable tools you don't need (remove them from the manifest)
- Use the gateway access policy to restrict who can email your agent

### Trusted extension code

Extensions (tools, providers, hooks, resolvers) run with full process permissions. A malicious extension could do anything the Protege process can do.

**Mitigation:**
- Review extension source code before enabling it
- Treat `extensions/extensions.json` as a security-sensitive file
- Keep your extension list explicit and minimal

### Costly model invocations

Every inbound email that passes the access policy triggers an LLM inference run (which costs money). Without access controls, anyone who discovers your agent's address can rack up API costs.

**Mitigation:**
- Enable the gateway access policy with `default_decision: deny`
- Monitor your LLM provider's usage dashboard

## Operational Checklist

1. Run `protege doctor` after any config change
2. Watch logs during initial exposure: `protege logs --scope gateway --follow`
3. Verify `admin_contact_email` is set and reachable
4. Test your access policy with real sender addresses before going public
5. Review which tools are enabled and remove any you don't need

## Enforce Rollout Checklist (Relay Ingress)

Use this sequence before moving `gateway_auth.mode` from `monitor` to `enforce`.

1. Configure trusted relay keys in `configs/security.json`:

```json
{
  "gateway_auth": {
    "enabled": true,
    "mode": "monitor",
    "policy": "require_dmarc_or_aligned_spf_dkim",
    "trusted_relays": [
      {
        "key_id": "relay-primary",
        "public_key_pem_path": "/etc/protege/gateway/relay-attestation.public.pem"
      }
    ]
  }
}
```

2. Ensure relay is configured with the matching attestation key pair in `relay/config.json`:
   - `relay_auth_attestation.enabled: true`
   - `relay_auth_attestation.keyId` matches gateway `trusted_relays[].key_id`
   - `relay_auth_attestation.privateKeyPath` points to readable private key file

3. In `monitor` mode, send one legit Gmail message and one spoof probe.
4. Inspect gateway logs:
   - legit message should show `reason=monitor_pass`
   - spoof probe should show `reason=monitor_fail`
5. Switch to `mode: "enforce"` and restart gateway.
6. Re-run legit + spoof probes:
   - legit should process normally
   - spoof should be rejected with `gateway.relay.ingest_failed` and auth failure reason

If legit messages are rejected in enforce mode, first check `relayAuthAttestationReason` in gateway logs. The most common cause is key mismatch or unreadable key path.
