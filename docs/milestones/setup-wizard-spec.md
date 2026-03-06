# Setup Wizard Spec

Status: Accepted (v1)  
Scope: `protege setup` interaction contract and behavior hardening.

## Goal

Provide a reliable first-run and rerun onboarding flow that is explicit, idempotent, and relay-first.

## Interaction Flow (Frozen)

`protege setup` (interactive when no setup config flags are passed):

1. Inference provider  
2. Inference API key (optional; writes `.env` when provided)  
3. Outbound mode (`relay|local`)  
4. Relay websocket URL (required only when outbound mode is `relay`)  
5. Web search provider (`none|perplexity|tavily`)  
6. Web search API key (optional; only prompted when provider is not `none`)  
7. Admin contact email for alerts (optional)  
8. Run doctor (`y|n`)  

Then setup applies:

1. scaffold (`init`)  
2. config updates  
3. persona bootstrap/reconcile  
4. env key writes  
5. optional doctor  
6. result summary payload

## Required vs Optional Inputs

Required:

1. provider
2. outbound mode
3. relay websocket URL when outbound is `relay`
4. web search provider

Optional:

1. inference API key
2. web search API key
3. admin contact email
4. doctor run flag

## Validation Rules

1. Relay websocket URL must be a valid `ws://` or `wss://` URL when outbound mode is `relay`.
2. Admin contact email, when provided, must match pragmatic email shape validation.
3. Existing schema/provider enum validations remain strict.

## Rerun Semantics (Hardening)

When rerunning `protege setup`, defaults are hydrated from existing project state before prompting or applying:

1. `configs/inference.json` provider
2. `configs/gateway.json` relay mode + relay ws URL
3. `configs/system.json` admin contact email
4. `extensions/extensions.json` web search provider
5. `.env` provider/web-search keys (for prompt seed only)

This prevents accidental reset to scaffold defaults on rerun.

## Result Summary Contract

Setup output includes:

1. persona id and email address
2. selected provider/outbound/web-search mode
3. written env key names
4. `nextCommand` recommendation:
   - `protege gateway start` when doctor already ran
   - `protege doctor && protege gateway start` otherwise
