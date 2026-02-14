import { beforeAll, describe, expect, it } from 'vitest';

import { loadToolRegistry } from '@engine/harness/tool-registry';

let toolNames: string[] = [];

beforeAll(async (): Promise<void> => {
  const registry = await loadToolRegistry();
  toolNames = Object.keys(registry).sort();
});

describe('harness tool registry', () => {
  it('loads enabled tools from extensions manifest', () => {
    expect(toolNames.includes('send_email')).toBe(true);
  });
});
