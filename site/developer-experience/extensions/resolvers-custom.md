# Build a Custom Resolver

## Directory Layout

```text
extensions/resolvers/custom-note/
  index.ts
  README.md
```

## Resolver Example

```ts
import type { HarnessResolverDefinition } from '@engine/harness/resolvers/types';

export const resolver: HarnessResolverDefinition = {
  name: 'custom-note',
  resolve: (
    args,
  ) => {
    const personaId = String(args.invocation.context.personaId ?? 'unknown');
    const profile = args.invocation.type;
    const noteLabel = args.resolverArgs[0] ?? 'default';

    return {
      sections: [
        `Profile: ${profile}`,
        `Persona: ${personaId}`,
        `Label: ${noteLabel}`,
      ],
    };
  },
};
```

## Register in Manifest

```json
{
  "resolvers": [
    {
      "name": "custom-note",
      "config": {
        "enabled": true
      }
    }
  ]
}
```

## Use in `configs/context.json`

```json
{
  "thread": [
    "load-file(prompts/system.md)",
    "custom-note(primary)"
  ],
  "responsibility": [
    "load-file(prompts/system.md)",
    "custom-note(background)"
  ]
}
```

## Output Guidance

Return one of:

1. `string` (added as one section),
2. object with `sections`,
3. object with `history` entries,
4. object with `activeMemory`,
5. object with `inputText`.

Return `null` or `undefined` when the resolver has no contribution for a given invocation.
