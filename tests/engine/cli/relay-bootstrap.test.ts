import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runCli } from '@engine/cli/index';
import { listPersonas } from '@engine/shared/personas';
import { createTestWorkspaceFromFixture } from '@tests/helpers/workspace';

let firstBootstrapPersonaId = '';
let firstBootstrapCreatedPersona = false;
let firstBootstrapRelayUrl = '';
let secondBootstrapPersonaId = '';
let secondBootstrapCreatedPersona = true;
let personaCountAfterSecondBootstrap = 0;
let gatewayConfigRelayEnabled = false;
let gatewayConfigRelayWsUrl = '';
let gatewayConfigMailDomain = '';
let gatewayConfigPreservedTransportHost = '';
let bootstrapPersonaEmailDomain = '';
let workspace!: ReturnType<typeof createTestWorkspaceFromFixture>;

beforeAll(async (): Promise<void> => {
  workspace = createTestWorkspaceFromFixture({
    fixtureName: 'minimal-protege',
    tempPrefix: 'protege-cli-relay-bootstrap-',
  });
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const outputs: string[] = [];
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    outputs.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  }) as typeof process.stdout.write;

  workspace.patchConfigFiles({
    'gateway.json': {
      mode: 'dev',
      host: '127.0.0.1',
      port: 2525,
      mailDomain: 'localhost',
      transport: {
        host: '127.0.0.1',
        port: 1025,
        secure: false,
      },
    },
  });

  await runCli({
    argv: ['relay', 'bootstrap', '--relay-ws-url', 'ws://relay.test/ws', '--json'],
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
    argv: ['relay', 'bootstrap', '--relay-ws-url', 'ws://relay.test/ws', '--json'],
  });
  const secondResult = JSON.parse(outputs.pop() ?? '{}') as {
    personaId: string;
    createdPersona: boolean;
  };
  secondBootstrapPersonaId = secondResult.personaId;
  secondBootstrapCreatedPersona = secondResult.createdPersona;
  personaCountAfterSecondBootstrap = listPersonas().length;

  const gatewayConfig = JSON.parse(
    readFileSync(join(workspace.tempRootPath, 'configs', 'gateway.json'), 'utf8'),
  ) as {
    mailDomain?: string;
    relay?: {
      enabled?: boolean;
      relayWsUrl?: string;
    };
    transport?: {
      host?: string;
    };
  };
  gatewayConfigMailDomain = gatewayConfig.mailDomain ?? '';
  gatewayConfigRelayEnabled = gatewayConfig.relay?.enabled === true;
  gatewayConfigRelayWsUrl = gatewayConfig.relay?.relayWsUrl ?? '';
  gatewayConfigPreservedTransportHost = gatewayConfig.transport?.host ?? '';
  bootstrapPersonaEmailDomain = (listPersonas()[0]?.emailAddress ?? '').split('@')[1] ?? '';

  process.stdout.write = stdoutWrite;
});

afterAll((): void => {
  workspace.cleanup();
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

  it('replaces localhost mail domain with inferred relay mail domain', () => {
    expect(gatewayConfigMailDomain).toBe('mail.test');
  });

  it('reconciles persona email address domain with relay mail domain', () => {
    expect(bootstrapPersonaEmailDomain).toBe('mail.test');
  });

  it('preserves existing non-relay gateway config fields', () => {
    expect(gatewayConfigPreservedTransportHost).toBe('127.0.0.1');
  });

  it('creates gateway config file when bootstrap runs', () => {
    expect(existsSync(join(workspace.tempRootPath, 'configs', 'gateway.json'))).toBe(true);
  });
});
