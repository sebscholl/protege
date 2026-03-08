# Toolkit

Extension Surface: Yes

This directory exposes the stable, supported import surface for extension authors:

1. `@protege-pack/toolkit`

What belongs here:

1. Re-exported contracts and helpers intentionally exposed for extension development.
2. Typed APIs used by custom tools, hooks, resolvers, and providers.

What does not belong here:

1. Core runtime orchestration logic.
2. Internal-only modules that are not part of the extension author contract.
