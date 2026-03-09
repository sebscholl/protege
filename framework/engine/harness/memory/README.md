# Harness Memory

Extension Surface: No

This directory contains database/query and synthesis helpers used by default memory hooks.

Contents:

1. `storage.ts`: thread-memory and active-memory synthesis state persistence helpers.
2. `synthesis.ts`: provider-backed text synthesis helpers used by memory hook flows.

Constraints:

1. Keep hook-specific orchestration in `extensions/hooks/*`.
2. Keep storage/query logic centralized here rather than embedding SQL in hook modules.
