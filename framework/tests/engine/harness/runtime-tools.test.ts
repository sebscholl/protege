import { beforeAll, describe, expect, it } from 'vitest';

import { buildProviderTools } from '@engine/harness/runtime';
import { loadToolRegistry } from '@engine/harness/tools/registry';

let providerToolNames: string[] = [];

beforeAll(async (): Promise<void> => {
  const registry = await loadToolRegistry();
  providerToolNames = buildProviderTools({
    registry,
  }).map((tool) => tool.name);
});

describe('harness runtime tool exposure', () => {
  it('builds provider tool declarations from extension registry', () => {
    expect(providerToolNames.includes('send_email')).toBe(true);
  });
});
