# Security and Risk Model

This page documents Protege v1 security behavior, practical hardening patterns, and common failure modes.

## Threat Model (v1)

Protege is intentionally powerful and minimally sandboxed in v1.

1. Tools execute with local process permissions.
2. Extensions are trusted in-process code.
3. Local filesystem data is user-owned and not encrypted by Protege.
4. Relay is optional infrastructure, not a trust boundary replacement.

## Core Controls Implemented

## Gateway sender access policy

Config: `configs/security.json`

Policy fields:

1. `enabled`
2. `default_decision` (`allow` or `deny`)
3. `allow` wildcard rules
4. `deny` wildcard rules

Evaluation order:

1. deny rules
2. allow rules
3. default decision

This means deny always wins if both match.

## Recursion guard for agent-to-agent loops

Config: `configs/inference.json -> recursion_depth`

Runtime behavior:

1. Outbound `email.send` stamps `X-Protege-Recursion` on every outbound message.
2. Inbound messages with `X-Protege-Recursion: 0` (or lower) are rejected before persistence/execution.
3. Inbound `X-Protege-Recursion: N` is decremented to `N-1` and carried forward.

This caps cross-agent reply loops at gateway ingress.

## Failure visibility

Config: `configs/system.json -> admin_contact_email`

1. Terminal runtime failures are logged.
2. If admin contact is configured and outbound channel is available, failure alert emails are attempted.
3. `protege doctor` reports missing/invalid alert config.

## Recommended Security Profiles

## Baseline (single user, low exposure)

1. Keep relay enabled only when needed.
2. Set `admin_contact_email`.
3. Keep `gateway_access.enabled: true` with explicit rules.
4. Use `default_decision: deny` unless you intentionally accept broad inbound.

Suggested policy:

```json
{
  "gateway_access": {
    "enabled": true,
    "default_decision": "deny",
    "allow": ["trusted-user@example.com"],
    "deny": []
  }
}
```

## Controlled multi-sender

1. Start from deny-by-default.
2. Add narrow allow rules per domain or sender.
3. Add broad deny overrides for known noisy ranges.

Example:

```json
{
  "gateway_access": {
    "enabled": true,
    "default_decision": "deny",
    "allow": ["*@partner.example"],
    "deny": ["blocked-user@partner.example"]
  }
}
```

## Relay-first internet exposure

1. Keep gateway policy enabled; do not rely on obscurity of persona addresses.
2. Configure SPF/DKIM/PTR correctly for relay domain operations.
3. Set conservative recursion depth (`3` to `6`) to constrain loops.

## Risks You Must Account For

## Unsandboxed tools (`file.*`, `shell.exec`, `web.fetch`)

Impact:

1. Arbitrary file reads/writes.
2. Arbitrary shell execution.
3. External HTTP fetch side effects and content poisoning risks.

Mitigation:

1. Run Protege under a dedicated OS user.
2. Restrict filesystem permissions of that user.
3. Avoid running against privileged directories.

## Trusted extension execution

Impact:

1. Third-party hooks/tools/providers/resolvers run with full process capability.

Mitigation:

1. Treat extension installation as code execution.
2. Review extension source before enabling it.
3. Keep `extensions/extensions.json` minimal and explicit.

## Over-permissive gateway policy

Impact:

1. Unwanted inbound traffic can trigger costly model/tool runs.

Mitigation:

1. Prefer `default_decision: deny`.
2. Keep allowlist narrow.
3. Use deny overrides for known abusive patterns.

## Operational Checklist

1. Run `protege doctor` after config changes.
2. Tail logs with `protege logs --scope gateway --follow` during exposure tests.
3. Confirm `admin_contact_email` is set and valid.
4. Validate gateway policy behavior with real sender addresses before broad rollout.
