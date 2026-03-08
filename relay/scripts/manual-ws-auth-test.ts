import type { KeyObject } from 'node:crypto';

import { generateKeyPairSync, sign } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { base32Encode, extractEd25519RawPublicKey } from '@relay/src/crypto';
import { readPositiveIntOrFallback } from '@relay/scripts/number';

/**
 * Represents one normalized manual relay websocket auth test configuration.
 */
export type RelayWsManualTestConfig = {
  url: string;
  timeoutMs: number;
};

/**
 * Represents one decoded control payload from relay websocket responses.
 */
export type RelayWsControlPayload = {
  type: string;
  [key: string]: unknown;
};

/**
 * Represents one manual websocket auth script result payload.
 */
export type RelayWsManualAuthResult = {
  status: 'ok' | 'auth_error';
  code?: string;
};

/**
 * Builds one lowercase base32 public key identity from one ed25519 public key.
 */
export function buildRelayPublicKeyBase32(
  args: {
    publicKey: KeyObject;
  },
): string {
  const publicKeyDer = args.publicKey.export({
    type: 'spki',
    format: 'der',
  }) as Buffer;
  const rawPublicKey = extractEd25519RawPublicKey({
    spkiDer: publicKeyDer,
  });
  return base32Encode({
    value: rawPublicKey,
  });
}

/**
 * Resolves manual relay websocket auth test args from CLI argv values.
 */
export function resolveRelayWsManualTestConfig(
  args: {
    argv: string[];
  },
): RelayWsManualTestConfig {
  const url = args.argv[2] ?? 'ws://127.0.0.1:8080/ws';
  return {
    url,
    timeoutMs: readPositiveIntOrFallback({
      raw: args.argv[3],
      fallback: 10000,
    }),
  };
}

/**
 * Converts one websocket message event payload into UTF-8 text for JSON parsing.
 */
export async function relayWsMessageDataToText(
  args: {
    data: unknown;
  },
): Promise<string | undefined> {
  if (typeof args.data === 'string') {
    return args.data;
  }

  if (Buffer.isBuffer(args.data)) {
    return args.data.toString('utf8');
  }

  if (args.data instanceof ArrayBuffer) {
    return Buffer.from(args.data).toString('utf8');
  }

  if (typeof Blob !== 'undefined' && args.data instanceof Blob) {
    const arrayBuffer = await args.data.arrayBuffer();
    return Buffer.from(arrayBuffer).toString('utf8');
  }

  return undefined;
}

/**
 * Runs one full websocket challenge-response auth exchange against a relay instance.
 */
export async function runRelayWsManualAuthTest(
  args: {
    config: RelayWsManualTestConfig;
    writeLine: (line: string) => void;
  },
): Promise<RelayWsManualAuthResult> {
  if (typeof WebSocket === 'undefined') {
    throw new Error('Global WebSocket is unavailable in this Node runtime.');
  }

  const keyPair = generateKeyPairSync('ed25519');
  const publicKeyBase32 = buildRelayPublicKeyBase32({
    publicKey: keyPair.publicKey,
  });
  args.writeLine(`CONNECT ${args.config.url}`);
  args.writeLine(`PUBLIC_KEY ${publicKeyBase32}`);

  return new Promise<RelayWsManualAuthResult>((resolve, reject): void => {
    const socket = new WebSocket(args.config.url);
    const timeout = setTimeout((): void => {
      socket.close();
      reject(new Error(`Timed out after ${args.config.timeoutMs}ms while waiting for relay auth completion.`));
    }, args.config.timeoutMs);

    socket.onopen = (): void => {
      socket.send(JSON.stringify({
        type: 'auth_challenge_request',
        publicKeyBase32,
      }));
      args.writeLine('SENT auth_challenge_request');
    };

    socket.onmessage = async (event: MessageEvent): Promise<void> => {
      try {
        const messageText = await relayWsMessageDataToText({
          data: event.data,
        });
        if (!messageText) {
          throw new Error('Received unsupported websocket message payload format.');
        }

        const payload = JSON.parse(messageText) as RelayWsControlPayload;
        args.writeLine(`RECV ${payload.type}`);

        if (payload.type === 'auth_challenge') {
          if (
            typeof payload.challengeText !== 'string'
            || typeof payload.challengeId !== 'string'
          ) {
            throw new Error('Received invalid auth_challenge payload.');
          }

          const signatureBase64 = sign(
            null,
            Buffer.from(payload.challengeText, 'utf8'),
            keyPair.privateKey,
          ).toString('base64');
          socket.send(JSON.stringify({
            type: 'auth_challenge_response',
            publicKeyBase32,
            challengeId: payload.challengeId,
            signatureBase64,
          }));
          args.writeLine('SENT auth_challenge_response');
          return;
        }

        if (payload.type === 'auth_ok') {
          args.writeLine('AUTH SUCCESS');
          clearTimeout(timeout);
          socket.close();
          resolve({
            status: 'ok',
          });
          return;
        }

        if (payload.type === 'auth_error') {
          const code = String(payload.code ?? 'unknown');
          args.writeLine(`AUTH ERROR code=${code}`);
          clearTimeout(timeout);
          socket.close();
          resolve({
            status: 'auth_error',
            code,
          });
          return;
        }
      } catch (error) {
        clearTimeout(timeout);
        socket.close();
        reject(error);
      }
    };

    socket.onerror = (): void => {
      clearTimeout(timeout);
      reject(new Error('WebSocket connection failed.'));
    };

    socket.onclose = (): void => undefined;
  });
}

/**
 * Executes the manual relay websocket auth test from CLI arguments.
 */
async function main(): Promise<void> {
  const config = resolveRelayWsManualTestConfig({
    argv: process.argv,
  });
  const result = await runRelayWsManualAuthTest({
    config,
    writeLine: (line: string): void => {
      process.stdout.write(`${line}\n`);
    },
  });
  if (result.status === 'auth_error') {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: Error): void => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
