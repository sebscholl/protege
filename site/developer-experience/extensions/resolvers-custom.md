# Custom Resolvers

Custom resolvers let you inject any context into your agent's inference runs — database lookups, API calls, computed data, etc.

## Example: Sender Relationship Context

A common need is giving your agent context about *who* it's talking to. This resolver looks up a relationship file based on the sender's email address and injects it into the inference context. This way your agent knows the sender's name, role, preferences, and history without being told every time.

### Directory structure

Create a `relationships/` directory in your workspace with one markdown file per contact, named by their email address:

```
protege-hq/
├── relationships/
│   ├── alice@acme.com.md
│   ├── bob@startup.io.md
│   └── carol@bigcorp.com.md
├── extensions/
│   └── resolvers/
│       └── relationship-context/
│           └── index.ts
└── ...
```

Each relationship file contains what your agent should know about that person:

```md
<!-- relationships/alice@acme.com.md -->
# Alice Chen — VP Engineering, Acme Corp

- **Role:** VP Engineering, reports to CTO
- **Company:** Acme Corp (Series B, 120 employees)
- **Relationship:** Active customer since Jan 2026. Primary technical contact.
- **Communication style:** Direct, prefers bullet points over prose. Responds quickly.
- **Current topics:** Migrating from v1 to v2 API, concerned about downtime.
- **Notes:** Timezone is PST. Prefers meeting before 11am her time.
```

### Implement the resolver

```
extensions/resolvers/relationship-context/
├── index.ts
└── README.md
```

**`index.ts`:**

```ts
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { HarnessResolverDefinition } from 'protege-toolkit';

export const resolver: HarnessResolverDefinition = {
  name: 'relationship-context',
  resolve: async (args) => {
    // The directory to look in — defaults to "relationships"
    const dir = args.resolverArgs[0] ?? 'relationships';

    // The sender's email is available on the invocation context
    const sender = String(args.invocation.context.input?.sender ?? '');
    if (sender.length === 0) {
      return null;
    }

    // Look for a file named after the sender's email
    const filePath = join(dir, `${sender.toLowerCase()}.md`);
    if (!existsSync(filePath)) {
      return null; // No relationship file — silently skip
    }

    const content = readFileSync(filePath, 'utf-8').trim();
    if (content.length === 0) {
      return null;
    }

    return {
      sections: [
        `## Relationship context for ${sender}\n\n${content}`,
      ],
    };
  },
};
```

### Register in the manifest

Add the resolver to `extensions/extensions.json`:

```json
{
  "resolvers": ["load-file", "relationship-context", "thread-history", "current-input"]
}
```

### Add to the context pipeline

Insert it into `configs/context.json` — place it after persona instructions so the agent has relationship context before seeing the message:

```json
{
  "thread": [
    "load-file(prompts/system.md)",
    "load-file(personas/{persona_id}/PERSONA.md)",
    "load-file(memory/{persona_id}/active.md)",
    "relationship-context(relationships)",
    "thread-memory-state",
    "thread-history",
    "invocation-metadata",
    "current-input"
  ]
}
```

Now when Alice emails your agent, it automatically gets her relationship file injected into the context. When an unknown sender writes, the resolver silently contributes nothing.

## Resolver Output Types

Your resolver can return different shapes depending on what it contributes:

| Return type | What it does |
|------------|--------------|
| `string` | Added as a single system section |
| `{ sections: string[] }` | Multiple system sections |
| `{ activeMemory: string }` | Sets the active memory content |
| `{ history: HistoryEntry[] }` | Provides conversation history entries |
| `{ inputText: string }` | Overrides the input message text |
| `null` or `undefined` | No contribution (silently skipped) |

## The Resolver Contract

```ts
type HarnessResolverDefinition = {
  name: string;
  resolve: (args: {
    invocation: {
      type: 'thread' | 'responsibility';
      context: Record<string, unknown>;  // Includes personaId, threadId, input, etc.
    };
    config: Record<string, unknown>;     // Merged config from manifest + defaults
    resolverArgs: string[];              // Positional args from context.json step
  }) => Promise<ResolverOutput | null | undefined> | ResolverOutput | null | undefined;
};

type ResolverOutput = string | {
  sections?: string[];
  activeMemory?: string;
  history?: HarnessContextHistoryEntry[];
  inputText?: string;
};
```
