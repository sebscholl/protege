# Resolvers

Extension Surface: Yes

Resolver extensions provide dynamic context text blocks for the harness context pipeline.

Resolvers are loaded through `extensions/extensions.json` under `resolvers`.

Resolver contract:

1. Directory: `extensions/resolvers/{resolver-name}/`
2. Entry point: `index.ts` or `index.js`
3. Export: `resolver` definition with:
   1. `name`
   2. `resolve({ invocation, config, resolverArgs })`

Invocation contract:

1. Top-level `type`
2. Top-level `context`

Where:

1. `type` is `thread` or `responsibility`
2. `context` contains source-specific fields (`personaId`, `threadId`, etc.)
3. `resolverArgs` contains positional string args parsed from `config/context.json` resolver step calls

Resolver step syntax:

1. `resolver-name`
2. `resolver-name(arg1, arg2, arg3)`

Guidance:

1. Keep resolvers read-only and deterministic in v1.
2. Return either:
   1. a string section
   2. an object with optional fields:
      1. `sections: string[]`
      2. `activeMemory: string`
      3. `history: HarnessContextHistoryEntry[]`
      4. `inputText: string`
3. Return `null`/empty when no contribution is needed.
3. Keep payloads concise to avoid context bloat.
