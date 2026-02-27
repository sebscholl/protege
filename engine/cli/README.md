# CLI

Extension Surface: No

Command-line interfaces for chat, diagnostics, and operational workflows.

The TUI operates as a thin client over standard agent messaging flows.

Key commands:

1. `protege gateway start|stop|restart [--dev]`
2. `protege persona create|list|info|delete ...`
3. `protege relay bootstrap [--relay-ws-url <ws://...>]`
4. `protege init [--path <dir>] [--force]`
5. `protege setup [--path <dir>] [--force] [--provider <openai|anthropic|gemini|grok>] [--outbound <relay|local>] [--non-interactive] ...`
6. `protege status [--json]`
7. `protege logs [--follow] [--tail <n>] [--scope <gateway|harness|relay|all>] [--json]`
8. `protege doctor [--json]`
9. `protege chat --persona <persona_id_or_prefix> [--thread <thread_id>]`
10. `protege scheduler sync [--persona <persona_id_or_prefix>]`

Command roles:

1. `init` is scaffold-only.
2. `setup` is onboarding orchestration (scaffold + opinionated configuration) and prompts interactively when no setup config flags are provided.
