# Testing Conventions

## Core Rule

1. We write tests for everything we write.
2. Test runner is `Vitest`.
3. Mocking policy is network-only: do not mock internal modules/classes/functions.

## Test Design Rules

1. Each `it(...)` block MUST be one to two lines of behavior-focused code.
2. Setup MUST live in `beforeEach`, `beforeAll`, or enclosing `describe` setup helpers.
3. Assertions MUST be specific and behavior-oriented.
4. Each test SHOULD validate one behavior.
5. Test names MUST describe observable outcomes, not implementation details.
6. For async results with multiple assertions, execute the async action once in setup (`beforeAll`/`beforeEach`) and split assertions across separate `it(...)` blocks.

## Readability Rules

1. Avoid branching logic in test bodies.
2. Prefer small factory helpers over repeated inline object literals.
3. Avoid local mock graphs; prefer deterministic fixtures and MSW handlers.
4. Use clear arrangement: setup, action, assertion.
5. Test files SHOULD avoid helper functions unless shared or materially improving readability.

## Network Interception Rules

1. Use `MSW` for network interception.
2. Network calls MUST be intercepted with explicit fixture-backed handlers from `tests/fixtures/api/`.
3. Fixtures MUST cover both success and error paths when behavior differs.
4. Tests SHOULD declare handlers in setup using shared helper utilities exported by `tests/network/index.ts`.
5. Intercept helpers MAY support per-test payload overrides (for example `merge` semantics) while preserving fixture defaults.
6. Network passthrough in tests is disallowed unless explicitly justified.
7. Request matching details (method/path) MUST come from fixture metadata, not test-local route definitions.

See `network-testing.md` for fixture shape and naming conventions.

## File and Path Rules

1. Use path aliases (for example `@engine/*`, `@tests/*`) instead of deep relative paths between major top-level modules.
2. Extension-source tests should assert extension imports use `protege-toolkit`, not internal aliases.
3. Configure aliases consistently in both `tsconfig` and Vitest config.
4. Test files MUST mirror the path of the source file under `tests/`.
5. Source-to-test mapping format:
   - source: `engine/gateway/index.ts`
   - test: `tests/engine/gateway/index.test.ts`
6. Keep any shared test-only utilities in dedicated helper modules and not mixed into mirrored source test files.

## Minimum Coverage Expectations

1. New modules MUST include unit tests.
2. Integration boundaries (gateway, harness, scheduler, relay) SHOULD include integration tests.
3. Bug fixes MUST include regression tests.

## Example Shape

```ts
import { describe, it, expect, beforeEach } from 'vitest';

describe('parseInboundMessage', () => {
  beforeEach(() => {
    // shared setup
  });

  it('returns normalized sender and subject', () => {
    expect(result).toMatchObject({ from: 'a@b.com', subject: 'Hi' });
  });
});
```
