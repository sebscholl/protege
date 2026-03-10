# Protege Monorepo

Documentation: https://docs.protege.bot

This repository contains three fully separate packages:

1. `framework/` - Protege CLI framework package (`protege-toolkit`)
2. `relay/` - standalone relay server package (`protege-relay`)
3. `site/` - documentation site package (`protege-site`)

Each package has its own `package.json`, scripts, dependencies, and tests.

## Current Release Posture

1. `framework/` is being prepared for `protege-toolkit@0.0.1-alpha.0`.
2. `relay/` remains a separate deployable server package and is not bundled into the framework npm publish.
3. `site/` remains a separate docs package and deploy target.

## Working model

Run commands from the package directory you are working on.

Examples:

```bash
cd framework && npm test
cd relay && npm run test
cd site && npm run docs:dev
```
