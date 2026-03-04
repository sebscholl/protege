import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readContextPipelineConfig } from '@engine/harness/context/config';

let tempRootPath = '';
let threadStepCount = -1;
let responsibilityResolverStep = '';
let parsedResolverArgs = '';
let parsedQuotedResolverArgs = '';
let invalidStepError = '';
let invalidProfileError = '';

beforeAll((): void => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-context-config-'));
  const validConfigPath = join(tempRootPath, 'context.json');
  writeFileSync(
    validConfigPath,
    JSON.stringify({
      thread: ['load-file(config/system-prompt.md)', 'thread-history'],
      responsibility: ['current-input(foo, bar)'],
    }),
  );

  const validConfig = readContextPipelineConfig({
    configPath: validConfigPath,
  });
  threadStepCount = validConfig.thread.length;
  responsibilityResolverStep = `${validConfig.responsibility[0]?.kind}:${validConfig.responsibility[0]?.resolverName}`;
  parsedResolverArgs = (validConfig.responsibility[0]?.resolverArgs ?? []).join('|');

  const quotedArgsConfigPath = join(tempRootPath, 'quoted-args.json');
  writeFileSync(
    quotedArgsConfigPath,
    JSON.stringify({
      thread: ['load-file("memory/{ persona_id }/active.md")'],
      responsibility: ['current-input'],
    }),
  );
  const quotedConfig = readContextPipelineConfig({
    configPath: quotedArgsConfigPath,
  });
  parsedQuotedResolverArgs = (quotedConfig.thread[0]?.resolverArgs ?? []).join('|');

  const invalidStepConfigPath = join(tempRootPath, 'invalid-step.json');
  writeFileSync(
    invalidStepConfigPath,
    JSON.stringify({
      thread: ['bogus:step'],
      responsibility: ['current-input'],
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
      thread: ['thread-history'],
      responsibility: 'current-input',
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

  it('parses positional resolver args', () => {
    expect(parsedResolverArgs).toBe('foo|bar');
  });

  it('normalizes quoted resolver args and preserves template tokens', () => {
    expect(parsedQuotedResolverArgs).toBe('memory/{ persona_id }/active.md');
  });

  it('fails clearly for unsupported step prefixes', () => {
    expect(invalidStepError.includes('Invalid resolver name')).toBe(true);
  });

  it('fails clearly when one profile step list is not an array', () => {
    expect(invalidProfileError.includes('must be an array')).toBe(true);
  });
});
