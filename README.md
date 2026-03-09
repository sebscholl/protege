# Protege Monorepo

This repository contains three fully separate packages:

1. `framework/` - Protege CLI framework package (`@protege-pack/toolkit`)
2. `relay/` - standalone relay server package (`@protege-pack/relay`)
3. `site/` - documentation site package (`@protege-pack/site`)

Each package has its own `package.json`, scripts, dependencies, and tests.

## Working model

Run commands from the package directory you are working on.

Examples:

```bash
cd framework && npm test
cd relay && npm run relay:start
cd site && npm run docs:dev
```
