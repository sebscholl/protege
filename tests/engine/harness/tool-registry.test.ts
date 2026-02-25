import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadToolRegistry } from '@engine/harness/tool-registry';

let toolNames: string[] = [];
let missingManifestToolCount = -1;
let tempRootPath = '';

beforeAll(async (): Promise<void> => {
  const registry = await loadToolRegistry();
  toolNames = Object.keys(registry).sort();

  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-tool-registry-'));
  const missingManifestRegistry = await loadToolRegistry({
    manifestPath: join(tempRootPath, 'extensions.json'),
  });
  missingManifestToolCount = Object.keys(missingManifestRegistry).length;
});

afterAll((): void => {
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('harness tool registry', () => {
  it('loads glob from extensions manifest', () => {
    expect(toolNames.includes('glob')).toBe(true);
  });

  it('loads search from extensions manifest', () => {
    expect(toolNames.includes('search')).toBe(true);
  });

  it('loads read_file from extensions manifest', () => {
    expect(toolNames.includes('read_file')).toBe(true);
  });

  it('loads write_file from extensions manifest', () => {
    expect(toolNames.includes('write_file')).toBe(true);
  });

  it('loads edit_file from extensions manifest', () => {
    expect(toolNames.includes('edit_file')).toBe(true);
  });

  it('loads enabled tools from extensions manifest', () => {
    expect(toolNames.includes('send_email')).toBe(true);
  });

  it('returns an empty registry when the extensions manifest is missing', () => {
    expect(missingManifestToolCount).toBe(0);
  });
});
