# Milestone Plan: Onboarding and Configuration Hardening

Status: In Progress  
Scope: Resolve first-run setup friction and stabilize defaults, secrets, tool config surfaces, and guided initialization.

## Goals

1. Make blank-project setup reliable without manual file hunting.
2. Normalize secret handling to env-only storage.
3. Support tool defaults with manifest-level override ergonomics.
4. Ensure relay-first outbound behavior works by default for new users.

## Decision Anchors

1. `docs/adr/0026-tool-config-manifest-deep-merge.md`
2. `docs/adr/0027-secrets-env-and-single-config-surface.md`
3. `docs/adr/0028-init-wizard-guided-onboarding.md`

## OH1. Tool Config Surface Unification (Issue #5 + extension pattern)

Status: Complete

### Tasks

1. Extend `extensions/extensions.json` parser to support object entries with `{ name, config }`.
2. Add tool `defaultConfig` support in tool contract and registry.
3. Implement deep-merge config resolver with array-replace semantics.
4. Migrate `web_search` to manifest-driven config overrides.
5. Keep string entry compatibility.

### Tests

1. String entry still resolves default config.
2. Object entry merges partial overrides over defaults.
3. Arrays replace, objects merge, scalars override.
4. Invalid object entry shapes fail clearly.

## OH2. Secrets and Canonical Config Cleanup (Issues #1, #2, #3, #4)

Status: Planned

### Tasks

1. Set default `admin_contact_email` blank in scaffolded config.
2. Switch inference provider credentials to env-var references.
3. Clean `.env.example` to sensitive credentials only.
4. Remove `*.local.json` recommendation/dependency from generated project and docs.
5. Ensure CLI startup env loading remains deterministic (`.env`, `.env.local`, shell precedence).

### Tests

1. Fresh init emits no secret values in JSON config.
2. Missing required env vars surface actionable errors.
3. Existing shell env vars override dotenv values.

## OH3. Relay-First Outbound Defaults (Issue #6)

Status: Planned

### Tasks

1. Ensure relay-mode generated config supports outbound sends without manual transport config.
2. Align generated gateway defaults to relay egress expectations.
3. Verify persona sender identity and mail-domain settings are consistent after bootstrap/init.

### Tests

1. Fresh relay-first scaffold can send outbound through relay with no extra config edits.
2. `doctor` catches misconfigured relay/outbound defaults.

## OH4. Delivery Reliability Bugfix (Issue #7)

Status: Planned

### Tasks

1. Reproduce chat/tool-success-but-no-delivery path.
2. Instrument action->egress->relay lifecycle for deterministic diagnosis.
3. Fix root cause and tighten success criteria for `email.send`.

### Tests

1. Tool success requires confirmed runtime egress success.
2. Failed egress propagates error status and does not produce false success logs.

## OH5. `send_email` Attachments Support (Issue #8)

Status: Planned

### Tasks

1. Extend tool schema for attachment descriptors.
2. Add runtime action payload support for attachments.
3. Ensure outbound transport and relay path send attachments correctly.

### Tests

1. Local transport send with attachments.
2. Relay path send with attachments.
3. Invalid attachment descriptors fail clearly.

## OH6. Tool-Failure Recovery Design (Issue #9, design first)

Status: Planned

### Tasks

1. Write ADR for bounded tool-error recovery loop in orchestrator.
2. Define recovery limits (max retries/turn budget/error classes).
3. Define stop conditions and user-visible failure summaries.

### Exit

1. ADR approved before implementation begins.

## OH7. Setup Wizard Implementation (Issue #10 + web-search provider choice)

Status: Planned

### Tasks

1. Build guided `protege init` wizard flow:
   - inference provider
   - inference API key
   - relay vs transport
   - first persona
   - web-search provider (`none`/`perplexity`/`tavily`)
   - optional web-search API key
   - doctor run
   - summary with persona email
   - optional gateway start
2. Add non-interactive flag path for automation use.

### Tests

1. Interactive happy path generates valid runnable project.
2. Relay-first path passes doctor out-of-box.
3. Web-search provider selection writes correct env + manifest config.

## Sequence

1. OH1
2. OH2
3. OH3
4. OH4
5. OH5
6. OH6 (ADR only)
7. OH7

## Exit Criteria

1. Fresh init can produce a working project without manual config surgery.
2. Secrets are env-only and docs are consistent.
3. Web-search config defaults + overrides are intuitive.
4. Relay-first outbound works by default.
5. All relevant docs and ADR indexes are updated.
