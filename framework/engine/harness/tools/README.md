# Harness Tools

Extension Surface: No

This directory owns generic tool orchestration contracts and registry logic.

It is responsible for:

1. Loading enabled tools from manifest.
2. Validating tool contract shape.
3. Dispatching tool execution by name.

Tool implementations belong in:

1. `extensions/tools/*`
