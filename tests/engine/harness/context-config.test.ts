import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readContextPipelineConfig } from '@engine/harness/context/config';

let tempRootPath = '';
let threadStepCount = -1;
let responsibilityResolverStep = '';
let invalidStepError = '';
let invalidProfileError = '';

beforeAll((): void => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-context-config-'));
  const validConfigPath = join(tempRootPath, 'context.json');
  writeFileSync(
    validConfigPath,
    JSON.stringify({
      thread: ['file:config/system-prompt.md', 'resolver:thread-history'],
      responsibility: ['resolver:current-input'],
    }),
  );

  const validConfig = readContextPipelineConfig({
    configPath: validConfigPath,
  });
  threadStepCount = validConfig.thread.length;
  responsibilityResolverStep = `${validConfig.responsibility[0]?.kind}:${validConfig.responsibility[0]?.value}`;

  const invalidStepConfigPath = join(tempRootPath, 'invalid-step.json');
  writeFileSync(
    invalidStepConfigPath,
    JSON.stringify({
      thread: ['bogus:step'],
      responsibility: ['resolver:current-input'],
    }),
  );
  try {
    readContextPipelineConfig({
      configPath: invalidStepConfigPath,
    });
  } catch (error) {
    invalidStepError = (error as Error).message;
  }

  const invalidProfileConfigPath = join(tempRootPath, 'invalid-profile.json');
  writeFileSync(
    invalidProfileConfigPath,
    JSON.stringify({
      thread: ['resolver:thread-history'],
      responsibility: 'resolver:current-input',
    }),
  );
  try {
    readContextPipelineConfig({
      configPath: invalidProfileConfigPath,
    });
  } catch (error) {
    invalidProfileError = (error as Error).message;
  }
});

afterAll((): void => {
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('harness context config', () => {
  it('reads thread pipeline steps in declared order', () => {
    expect(threadStepCount).toBe(2);
  });

  it('parses resolver step kind and value', () => {
    expect(responsibilityResolverStep).toBe('resolver:current-input');
  });

  it('fails clearly for unsupported step prefixes', () => {
    expect(invalidStepError.includes('must start with "file:" or "resolver:"')).toBe(true);
  });

  it('fails clearly when one profile step list is not an array', () => {
    expect(invalidProfileError.includes('must be an array')).toBe(true);
  });
});
