# Harness Hooks

Extension Surface: No

This directory owns generic hook orchestration contracts and dispatch behavior.

It is responsible for:

1. Loading enabled hooks from manifest.
2. Validating hook module contracts.
3. Dispatching events asynchronously with failure isolation.

Hook implementations belong in:

1. `extensions/hooks/*`
