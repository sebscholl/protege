import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runCli } from '@engine/cli/index';
import { listPersonas } from '@engine/shared/personas';

let tempRootPath = '';
let previousCwd = '';
let firstBootstrapPersonaId = '';
let firstBootstrapCreatedPersona = false;
let firstBootstrapRelayUrl = '';
let secondBootstrapPersonaId = '';
let secondBootstrapCreatedPersona = true;
let personaCountAfterSecondBootstrap = 0;
let gatewayConfigRelayEnabled = false;
let gatewayConfigRelayWsUrl = '';
let gatewayConfigPreservedTransportHost = '';

beforeAll(async (): Promise<void> => {
  tempRootPath = mkdtempSync(join(tmpdir(), 'protege-cli-relay-bootstrap-'));
  previousCwd = process.cwd();
  process.chdir(tempRootPath);

  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const outputs: string[] = [];
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    outputs.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  }) as typeof process.stdout.write;

  mkdirSync(join(tempRootPath, 'config'), { recursive: true });
  writeFileSync(join(tempRootPath, 'config', 'gateway.json'), JSON.stringify({
    mode: 'dev',
    host: '127.0.0.1',
    port: 2525,
    mailDomain: 'localhost',
    transport: {
      host: '127.0.0.1',
      port: 1025,
      secure: false,
    },
  }, null, 2));

  await runCli({
    argv: ['relay', 'bootstrap', '--relay-ws-url', 'ws://relay.test/ws'],
  });
  const firstResult = JSON.parse(outputs.pop() ?? '{}') as {
    personaId: string;
    createdPersona: boolean;
    relayWsUrl: string;
  };
  firstBootstrapPersonaId = firstResult.personaId;
  firstBootstrapCreatedPersona = firstResult.createdPersona;
  firstBootstrapRelayUrl = firstResult.relayWsUrl;

  await runCli({
    argv: ['relay', 'bootstrap', '--relay-ws-url', 'ws://relay.test/ws'],
  });
  const secondResult = JSON.parse(outputs.pop() ?? '{}') as {
    personaId: string;
    createdPersona: boolean;
  };
  secondBootstrapPersonaId = secondResult.personaId;
  secondBootstrapCreatedPersona = secondResult.createdPersona;
  personaCountAfterSecondBootstrap = listPersonas().length;

  const gatewayConfig = JSON.parse(
    readFileSync(join(tempRootPath, 'config', 'gateway.json'), 'utf8'),
  ) as {
    relay?: {
      enabled?: boolean;
      relayWsUrl?: string;
    };
    transport?: {
      host?: string;
    };
  };
  gatewayConfigRelayEnabled = gatewayConfig.relay?.enabled === true;
  gatewayConfigRelayWsUrl = gatewayConfig.relay?.relayWsUrl ?? '';
  gatewayConfigPreservedTransportHost = gatewayConfig.transport?.host ?? '';

  process.stdout.write = stdoutWrite;
});

afterAll((): void => {
  process.chdir(previousCwd);
  rmSync(tempRootPath, { recursive: true, force: true });
});

describe('relay bootstrap cli', () => {
  it('creates one persona during first relay bootstrap when none exist', () => {
    expect(firstBootstrapCreatedPersona).toBe(true);
  });

  it('returns relay websocket url in bootstrap output', () => {
    expect(firstBootstrapRelayUrl).toBe('ws://relay.test/ws');
  });

  it('keeps stable persona identity on idempotent bootstrap rerun', () => {
    expect(secondBootstrapPersonaId).toBe(firstBootstrapPersonaId);
  });

  it('does not create additional personas on bootstrap rerun', () => {
    expect([secondBootstrapCreatedPersona, personaCountAfterSecondBootstrap]).toEqual([false, 1]);
  });

  it('writes relay config as enabled in gateway config', () => {
    expect(gatewayConfigRelayEnabled).toBe(true);
  });

  it('writes requested relay websocket url into gateway config', () => {
    expect(gatewayConfigRelayWsUrl).toBe('ws://relay.test/ws');
  });

  it('preserves existing non-relay gateway config fields', () => {
    expect(gatewayConfigPreservedTransportHost).toBe('127.0.0.1');
  });

  it('creates gateway config file when bootstrap runs', () => {
    expect(existsSync(join(tempRootPath, 'config', 'gateway.json'))).toBe(true);
  });
});
