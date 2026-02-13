# Code Style Conventions

## Import Order (Mandatory)

Every file MUST organize imports in this exact order:

1. External types
2. Internal types
3. External package imports
4. Internal package imports

Each group MUST be separated by one blank line.

Example:

```ts
import type { IncomingHttpHeaders } from 'node:http';

import type { HarnessRequest } from '@engine/harness/types';

import { z } from 'zod';

import { createLogger } from '@engine/shared/logger';
```

## Function and Method Signatures

1. If a function signature has more than one argument, each argument MUST be on its own line.
2. If a method/function has more than one function-specific argument, use one typed object parameter instead of positional arguments.
3. Positional arguments are acceptable when one argument is a distinct shared typed object and the remaining argument is a single contextual value.
4. For unique (non-shared) argument signatures, use inline type declarations.
5. Only create shared named types when reused across modules.

Example:

```ts
export function createThreadContext(
  args: {
    threadId: string;
    maxTokens: number;
    includeSystemPrompt: boolean;
  },
): ThreadContext {
  // ...
}
```

## Documentation-in-Code

1. Every class, module, method, and function in source code MUST include JSDoc using `/** ... */`.
2. This includes private/internal functions and test helper functions.
3. This does not apply to `it(...)` test blocks.
4. JSDoc descriptions SHOULD be one to two contextualizing sentences.
5. JSDoc MUST explain purpose and intended use, not restate type annotations.

## Additional Style Rules (Filled Gaps)

1. Prefer named exports over default exports for internal modules.
2. Keep functions small and single-purpose.
3. Exported APIs SHOULD have explicit return types.
4. Throw typed/domain errors, not raw strings.
5. Avoid cross-boundary relative imports between top-level domains; use aliases.

## Path Aliases

Use these top-level aliases across source and tests:

1. `@engine/*`
2. `@extensions/*`
3. `@config/*`
4. `@memory/*`
5. `@tests/*`

## Naming

1. Files and directories: `kebab-case`.
2. Variables/functions: `camelCase`.
3. Types/classes/interfaces/enums: `PascalCase`.
4. Constants: `SCREAMING_SNAKE_CASE` only for true constants.
