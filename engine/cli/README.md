# CLI

Extension Surface: No

Command-line interfaces for chat, diagnostics, and operational workflows.

The TUI operates as a thin client over standard agent messaging flows.

Key commands:

1. `protege gateway start|stop|restart [--dev]`
2. `protege persona create|list|info|delete ... [--json]`
3. `protege relay bootstrap [--relay-ws-url <ws://...>] [--json]`
4. `protege init [--path <dir>] [--force] [--json]`
5. `protege setup [--path <dir>] [--force] [--provider <openai|anthropic|gemini|grok>] [--outbound <relay|local>] [--non-interactive] ... [--json]`
6. `protege status [--json]`
7. `protege logs [--follow] [--tail <n>] [--scope <gateway|harness|relay|scheduler|chat|all>] [--json]`
8. `protege doctor [--json]`
9. `protege chat [--persona <persona_id_or_prefix>] [--thread <thread_id>]`
10. `protege scheduler sync [--persona <persona_id_or_prefix>] [--json]`

Command roles:

1. `init` is scaffold-only.
2. `setup` is onboarding orchestration (scaffold + opinionated configuration) and prompts interactively when no setup config flags are provided.
3. CLI command output is pretty by default and machine-readable JSON when `--json` is provided.

Help authoring:

1. Top-level and command help text is file-backed via `engine/cli/{name}.help.txt`.
2. Root help source is `engine/cli/index.help.txt`.
3. Subcommand/action help can be file-backed as `engine/cli/{command}-{action}.help.txt`.
4. Use `protege help <command>`, `protege help <command> <action>`, or `protege <command> [<action>] --help`.
