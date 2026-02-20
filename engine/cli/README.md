# CLI

Extension Surface: No

Command-line interfaces for chat, diagnostics, and operational workflows.

The TUI operates as a thin client over standard agent messaging flows.

Key commands:

1. `protege gateway start|stop|restart [--dev]`
2. `protege persona create|list|info|use|delete ...`
3. `protege relay bootstrap [--relay-ws-url <ws://...>]`
4. `protege init [--path <dir>] [--force]`
5. `protege status [--json]`
6. `protege logs [--follow] [--tail <n>] [--scope <gateway|harness|relay|all>] [--json]`
7. `protege doctor [--json]`
8. `protege chat --persona <persona_id_or_prefix> [--thread <thread_id>]`
