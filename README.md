# Protege Monorepo

[![CI](https://github.com/sebscholl/protege/actions/workflows/ci.yml/badge.svg)](https://github.com/sebscholl/protege/actions/workflows/ci.yml)
[![Release](https://github.com/sebscholl/protege/actions/workflows/release.yml/badge.svg)](https://github.com/sebscholl/protege/actions/workflows/release.yml)
[![npm version](https://img.shields.io/npm/v/protege-toolkit/alpha?color=cb3837&label=npm)](https://www.npmjs.com/package/protege-toolkit)
[![GitHub release](https://img.shields.io/github/v/release/sebscholl/protege?include_prereleases&label=release)](https://github.com/sebscholl/protege/releases/latest)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen?logo=node.js)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Docs](https://img.shields.io/badge/docs-protege.bot-blue)](https://docs.protege.bot)

Documentation: https://docs.protege.bot

This repository contains three fully separate packages:

1. `framework/` - Protege CLI framework package (`protege-toolkit`)
2. `relay/` - standalone relay server package (`protege-relay`)
3. `site/` - documentation site package (`protege-site`)

Each package has its own `package.json`, scripts, dependencies, and tests.

## Current Release Posture

1. `framework/` is being prepared for `protege-toolkit@0.0.1-alpha.2`.
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
