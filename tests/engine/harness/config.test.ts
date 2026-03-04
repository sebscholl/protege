import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readInferenceRuntimeConfig } from '@engine/harness/config';

let tempRootPath = '';
let parsedProvider = '';
let parsedModel = '';
let parsedRecursionDepth = 0;
let parsedMaxToolTurns = 0;
let parsedTemperature = 0;
let parsedMaxOutputTokens = 0;
let parsedFallbackMaxToolTurns = 0;

beforeAll((): void => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-harness-config-'));
  const configPath = join(tempRootPath, 'inference.json');
  writeFileSync(configPath, JSON.stringify({
    provider: 'openai',
    model: 'gpt-4.1',
    recursion_depth: 5,
    max_tool_turns: 12,
    temperature: 0.5,
    max_output_tokens: 256,
  }));
  const parsed = readInferenceRuntimeConfig({
    configPath,
  });
  parsedProvider = parsed.provider;
  parsedModel = parsed.model;
  parsedRecursionDepth = parsed.recursionDepth;
  parsedMaxToolTurns = parsed.maxToolTurns;
  parsedTemperature = parsed.temperature ?? 0;
  parsedMaxOutputTokens = parsed.maxOutputTokens ?? 0;

  const invalidTurnsConfigPath = join(tempRootPath, 'inference.invalid-turns.json');
  writeFileSync(invalidTurnsConfigPath, JSON.stringify({
    provider: 'openai',
    model: 'gpt-4.1',
    recursion_depth: 3,
    max_tool_turns: 0,
  }));
  const invalidTurnsConfig = readInferenceRuntimeConfig({
    configPath: invalidTurnsConfigPath,
  });
  parsedFallbackMaxToolTurns = invalidTurnsConfig.maxToolTurns;
});

afterAll((): void => {
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('harness inference config parsing', () => {
  it('parses selected provider', () => {
    expect(parsedProvider).toBe('openai');
  });

  it('parses selected model', () => {
    expect(parsedModel).toBe('gpt-4.1');
  });

  it('parses recursion depth', () => {
    expect(parsedRecursionDepth).toBe(5);
  });

  it('parses max_tool_turns from inference config', () => {
    expect(parsedMaxToolTurns).toBe(12);
  });

  it('falls back to default max_tool_turns when configured value is invalid', () => {
    expect(parsedFallbackMaxToolTurns).toBe(8);
  });

  it('parses optional temperature from config file', () => {
    expect(parsedTemperature).toBe(0.5);
  });

  it('parses optional max_output_tokens from config file', () => {
    expect(parsedMaxOutputTokens).toBe(256);
  });
});
