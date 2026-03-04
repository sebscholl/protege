# Harness Resolvers

Extension Surface: No

This directory owns resolver contracts and resolver registry loading for context pipelines.

It is responsible for:

1. Resolver invocation contract (`type` + `context`).
2. Manifest-driven resolver registration.
3. Loading resolver modules from extension directories.

Resolver implementations belong in:

1. `extensions/resolvers/*`
